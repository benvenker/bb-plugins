// The recognizer's Swift source. The server builds it with swiftc on first use.
export const RECOGNIZER_SWIFT = String.raw`import AVFoundation
import CoreML

// The recognizer of the Voice Input plugin for BB. It runs the four Core ML
// graphs of Parakeet Ultra, a Parakeet TDT v3 model, on the Neural Engine,
// and answers one JSON line per request on stdin:
//   {"id":1,"audio":"/path/take.wav"} -> {"id":1,"text":"…"} or {"id":1,"error":"…"}
// A take can also arrive while it is spoken, as base64 of 16 kHz 16-bit
// little-endian samples. Its pieces are decoded as their audio comes in:
//   {"take":"a","samples":"…"}           no reply
//   {"id":2,"take":"a","finish":true} -> {"id":2,"text":"…"} or {"id":2,"error":"…"}
//   {"take":"a","drop":true}             no reply
// It prints {"ready":true} once the graphs are open, or {"error":"…"} and exits.

let rate = 16_000
/// The graphs read 15 s at a time: 240,000 samples in, 188 frames of 80 ms out.
let span = 240_000
let frameLength = 1_280
/// A piece after the first reads this much of the one before it again, so its
/// first words have their context. Its tokens there are dropped.
let context = 4 * rate
/// A piece also reads this much past its cut, so its last words have theirs.
/// The next piece writes them.
let lookahead = 3 * rate
/// A streamed take's last piece is decoded ahead each time this much audio has
/// come, so finishing has nothing left to do when the take ends in silence.
let guessEvery = rate / 2
/// A guess stands only when this much audio before it, and all after it, is silent.
let settled = rate / 4
/// A frame quieter than this, as RMS, holds no word.
let silence: Float = 0.005
let blank = 8_192
/// Tokens TDT may write on one frame before it has to move on.
let maxSymbols = 2

struct Failure: Error, CustomStringConvertible {
    let description: String
}

/// A mono file that AVAudioFile reads, as 16 kHz samples.
func load(_ url: URL) throws -> [Float] {
    let file = try AVAudioFile(forReading: url)
    let format = file.processingFormat
    guard let input = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(file.length))
    else { throw Failure(description: "Cannot read \(url.lastPathComponent)") }
    try file.read(into: input)
    let wanted = AVAudioFormat(
        commonFormat: .pcmFormatFloat32, sampleRate: Double(rate), channels: 1, interleaved: false)!
    guard let converter = AVAudioConverter(from: format, to: wanted) else {
        throw Failure(description: "Cannot convert \(format)")
    }
    converter.sampleRateConverterAlgorithm = AVSampleRateConverterAlgorithm_Mastering
    converter.sampleRateConverterQuality = AVAudioQuality.max.rawValue
    let capacity = AVAudioFrameCount(Double(input.frameLength) * wanted.sampleRate / format.sampleRate) + 4096
    var samples: [Float] = []
    var handed = false
    while let output = AVAudioPCMBuffer(pcmFormat: wanted, frameCapacity: capacity) {
        var failure: NSError?
        let status = converter.convert(to: output, error: &failure) { _, state in
            state.pointee = handed ? .endOfStream : .haveData
            defer { handed = true }
            return handed ? nil : input
        }
        if let failure { throw failure }
        samples += UnsafeBufferPointer(start: output.floatChannelData![0], count: Int(output.frameLength))
        if status != .haveData { break }
    }
    return samples
}

/// A part of a take that the graphs can hold. It reads context on both sides
/// of its own audio, keep, and writes only that.
typealias Piece = (read: Range<Int>, keep: Range<Int>)

/// The piece of a take that starts at start, once the audio after it is long
/// enough to fix its cut, or nil while the rest of the take fits the graphs.
/// Each cut falls in the quietest frame of a 5 s stretch, so it falls between
/// words; more audio never moves it.
func piece(of audio: [Float], from start: Int) -> Piece? {
    let from = max(0, start - context)
    if audio.count - from <= span { return nil }
    let end = from + span - lookahead
    var cut = end - frameLength, quiet = Float.infinity
    for at in stride(from: end - 5 * rate, to: end - frameLength, by: frameLength) {
        let energy = audio[at..<(at + frameLength)].reduce(0) { $0 + $1 * $1 }
        if energy < quiet { (cut, quiet) = (at + frameLength / 2, energy) }
    }
    return (from..<cut + lookahead, start..<cut)
}

/// A take and the tokens of its pieces decoded so far.
final class Take {
    var audio: [Float]
    /// Where the first piece not yet decoded starts.
    var start = 0
    var tokens: [Int] = []
    /// The last piece decoded ahead: where it started, how much audio it read, its tokens.
    var guess: (start: Int, count: Int, tokens: [Int])?
    /// When the last guess finished, and how long it took.
    var guessed = (at: Date.distantPast, took: TimeInterval(0))
    /// Why a piece failed; finishing the take reports it.
    var failure: Error?

    /// The piece from start to the end of the audio so far.
    var last: Piece { (max(0, start - context)..<audio.count, start..<audio.count) }

    /// Whether every frame of the audio after from is silent.
    func silent(after from: Int) -> Bool {
        stride(from: max(0, from), to: audio.count, by: frameLength).allSatisfy { at in
            let frame = audio[at..<min(at + frameLength, audio.count)]
            return (frame.reduce(0) { $0 + $1 * $1 } / Float(frame.count)).squareRoot() < silence
        }
    }

    init(_ audio: [Float] = []) { self.audio = audio }

    func append(_ data: Data) {
        data.withUnsafeBytes { raw in
            audio.reserveCapacity(audio.count + raw.count / 2)
            for at in stride(from: 0, to: raw.count - 1, by: 2) {
                let sample = Int16(littleEndian: raw.loadUnaligned(fromByteOffset: at, as: Int16.self))
                audio.append(Float(sample) / 32_768)
            }
        }
    }
}

final class Recognizer {
    private let preprocessor: MLModel
    private let encoder: MLModel
    private let decoder: MLModel
    private let joint: MLModel
    /// Each token's text. Control tokens such as <unk> and <|endoftext|> write nothing.
    private let pieces: [Int: String]

    init(folder: URL) throws {
        let configuration = MLModelConfiguration()
        configuration.computeUnits = .cpuAndNeuralEngine
        func open(_ name: String) throws -> MLModel {
            try MLModel(contentsOf: folder.appending(path: "\(name).mlmodelc"), configuration: configuration)
        }
        preprocessor = try open("Preprocessor")
        encoder = try open("Encoder")
        decoder = try open("Decoder")
        joint = try open("JointDecisionv3")
        let vocabulary = try JSONDecoder().decode(
            [String: String].self, from: Data(contentsOf: folder.appending(path: "parakeet_v3_vocab.json")))
        pieces = Dictionary(
            uniqueKeysWithValues: vocabulary.compactMap { id, piece in
                piece.count > 2 && piece.hasPrefix("<") && piece.hasSuffix(">") ? nil : Int(id).map { ($0, piece) }
            })
    }

    func transcribe(_ audio: [Float]) throws -> String {
        try finish(Take(audio))
    }

    /// Decodes every piece of the take whose cut its audio has fixed.
    func advance(_ take: Take) throws {
        while let next = piece(of: take.audio, from: take.start) {
            take.tokens += try tokens(of: next, in: take.audio)
            take.start = next.keep.upperBound
        }
    }

    /// Decodes the take's last piece ahead, once enough audio has come since the last time.
    func guess(_ take: Take) throws {
        if let guess = take.guess, guess.start == take.start, take.audio.count - guess.count < guessEvery { return }
        // A slow Mac guesses less often, so a take's end never waits behind guesses.
        if Date().timeIntervalSince(take.guessed.at) < 3 * take.guessed.took { return }
        let began = Date()
        take.guess = (take.start, take.audio.count, try tokens(of: take.last, in: take.audio))
        take.guessed = (Date(), Date().timeIntervalSince(began))
    }

    /// The take's text, with its last piece decoded, or guessed when only silence came after the guess.
    func finish(_ take: Take) throws -> String {
        if let failure = take.failure { throw failure }
        try advance(take)
        let tail: [Int]
        if let guess = take.guess, guess.start == take.start, take.silent(after: guess.count - settled) {
            tail = guess.tokens
        } else {
            tail = try tokens(of: take.last, in: take.audio)
        }
        let text = (take.tokens + tail).compactMap { pieces[$0] }.joined()
        return text.split(whereSeparator: \.isWhitespace).joined(separator: " ")
    }

    /// The tokens a piece writes for its own audio.
    private func tokens(of piece: Piece, in audio: [Float]) throws -> [Int] {
        // The take's last piece keeps its last frame too, which the encoder
        // may add past the audio.
        let end = piece.keep.upperBound == audio.count
            ? Int.max : (piece.keep.upperBound - piece.read.lowerBound + frameLength - 1) / frameLength
        let kept = (piece.keep.lowerBound - piece.read.lowerBound) / frameLength ..< end
        return try decode(Array(audio[piece.read])).filter { kept.contains($0.frame) }.map(\.token)
    }

    /// Greedy TDT decoding of one piece: at each frame the joint names the
    /// likeliest token and how many frames to jump, a blank jumping at least one.
    private func decode(_ samples: [Float]) throws -> [(token: Int, frame: Int)] {
        let (frames, count) = try encode(samples)
        var (output, h, c) = try step(blank, zeros(), zeros())
        var tokens: [(token: Int, frame: Int)] = []
        var frame = 0, emitted = 0
        while frame < count {
            let (token, duration) = try predict(frames, at: frame, after: output)
            var jump = duration
            if token == blank {
                jump = max(jump, 1)
            } else {
                tokens.append((token, frame))
                (output, h, c) = try step(token, h, c)
                emitted += 1
                if jump == 0 && emitted >= maxSymbols { jump = 1 }
            }
            if jump > 0 { emitted = 0 }
            frame += jump
        }
        return tokens
    }

    /// The piece's encoder frames, and how many of them hold audio.
    private func encode(_ samples: [Float]) throws -> (MLMultiArray, Int) {
        let audio = try MLMultiArray(shape: [1, NSNumber(value: span)], dataType: .float32)
        audio.withUnsafeMutableBufferPointer(ofType: Float.self) { buffer, _ in
            buffer.update(repeating: 0)
            _ = buffer.update(fromContentsOf: samples)
        }
        let length = try MLMultiArray(shape: [1], dataType: .int32)
        length[0] = NSNumber(value: samples.count)
        let mel = try preprocessor.prediction(
            from: MLDictionaryFeatureProvider(dictionary: ["audio_signal": audio, "audio_length": length]))
        let encoded = try encoder.prediction(
            from: MLDictionaryFeatureProvider(dictionary: [
                "mel": mel.featureValue(for: "mel")!,
                "mel_length": mel.featureValue(for: "mel_length")!,
            ]))
        let frames = encoded.featureValue(for: "encoder")!.multiArrayValue!
        let count = encoded.featureValue(for: "encoder_length")!.multiArrayValue![0].intValue
        return (frames, min(count, frames.shape[2].intValue))
    }

    /// The prediction network after one more token.
    private func step(_ token: Int, _ h: MLMultiArray, _ c: MLMultiArray) throws
        -> (MLMultiArray, MLMultiArray, MLMultiArray)
    {
        let targets = try MLMultiArray(shape: [1, 1], dataType: .int32)
        targets[0] = NSNumber(value: token)
        let length = try MLMultiArray(shape: [1], dataType: .int32)
        length[0] = 1
        let out = try decoder.prediction(
            from: MLDictionaryFeatureProvider(dictionary: [
                "targets": targets, "target_length": length, "h_in": h, "c_in": c,
            ]))
        return (
            out.featureValue(for: "decoder")!.multiArrayValue!,
            out.featureValue(for: "h_out")!.multiArrayValue!,
            out.featureValue(for: "c_out")!.multiArrayValue!
        )
    }

    /// The joint's likeliest token at a frame, and how many frames to jump.
    private func predict(_ frames: MLMultiArray, at frame: Int, after output: MLMultiArray) throws
        -> (token: Int, duration: Int)
    {
        let channels = frames.shape[1].intValue
        let slice = try MLMultiArray(shape: [1, NSNumber(value: channels), 1], dataType: .float32)
        let stride = frames.strides[1].intValue
        frames.withUnsafeBufferPointer(ofType: Float.self) { source in
            slice.withUnsafeMutableBufferPointer(ofType: Float.self) { target, _ in
                for channel in 0..<channels { target[channel] = source[channel * stride + frame] }
            }
        }
        let out = try joint.prediction(
            from: MLDictionaryFeatureProvider(dictionary: ["encoder_step": slice, "decoder_step": output]))
        return (
            out.featureValue(for: "top_k_ids")!.multiArrayValue![0].intValue,
            out.featureValue(for: "duration")!.multiArrayValue![0].intValue
        )
    }

    private func zeros() throws -> MLMultiArray {
        let array = try MLMultiArray(shape: [2, 1, 640], dataType: .float32)
        array.withUnsafeMutableBufferPointer(ofType: Float.self) { buffer, _ in buffer.update(repeating: 0) }
        return array
    }
}

struct Request: Decodable {
    let id: Int?
    let audio: String?
    let take: String?
    let samples: String?
    let finish: Bool?
    let drop: Bool?
}

func send(_ reply: [String: Any]) {
    let line = try! JSONSerialization.data(withJSONObject: reply) + Data("\n".utf8)
    FileHandle.standardOutput.write(line)
}

let recognizer: Recognizer
do {
    recognizer = try Recognizer(folder: URL(fileURLWithPath: CommandLine.arguments[1]))
    // The first run compiles the graphs for the Neural Engine; a take should not wait for it.
    _ = try recognizer.transcribe([Float](repeating: 0, count: frameLength))
} catch {
    send(["error": "\(error)"])
    exit(1)
}
send(["ready": true])

var takes: [String: Take] = [:]
while let line = readLine() {
    guard let request = try? JSONDecoder().decode(Request.self, from: Data(line.utf8)) else { continue }
    if let name = request.take {
        let take = takes[name] ?? Take()
        takes[name] = take
        if let samples = request.samples, let data = Data(base64Encoded: samples), take.failure == nil {
            take.append(data)
            do {
                try recognizer.advance(take)
                try recognizer.guess(take)
            } catch {
                take.failure = error
            }
        }
        if request.drop == true { takes[name] = nil }
        guard request.finish == true, let id = request.id else { continue }
        takes[name] = nil
        do {
            send(["id": id, "text": try recognizer.finish(take)])
        } catch {
            send(["id": id, "error": "\(error)"])
        }
    } else if let id = request.id, let audio = request.audio {
        do {
            send(["id": id, "text": try recognizer.transcribe(load(URL(fileURLWithPath: audio)))])
        } catch {
            send(["id": id, "error": "\(error)"])
        }
    }
}
`;
