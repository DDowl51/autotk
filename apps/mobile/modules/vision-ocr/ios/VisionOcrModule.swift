import ExpoModulesCore
import Vision
import UIKit

// 手机端 OCR：用 iOS 自带 Vision 框架识别截图中的文字。
// 返回每段文字 + 归一化(0~1)的左上原点边界框，JS 侧据此筛选文案区。
public class VisionOcrModule: Module {
  public func definition() -> ModuleDefinition {
    Name("VisionOcr")

    AsyncFunction("recognize") { (base64: String, promise: Promise) in
      guard let data = Data(base64Encoded: base64),
            let image = UIImage(data: data),
            let cgImage = image.cgImage else {
        promise.reject("E_IMAGE", "无法解码图片")
        return
      }

      let request = VNRecognizeTextRequest { (request, error) in
        if let error = error {
          promise.reject("E_OCR", error.localizedDescription)
          return
        }
        let observations = request.results as? [VNRecognizedTextObservation] ?? []
        var results: [[String: Any]] = []
        for obs in observations {
          guard let candidate = obs.topCandidates(1).first else { continue }
          let box = obs.boundingBox // 归一化，原点在左下
          results.append([
            "text": candidate.string,
            "x": box.minX,
            "y": 1.0 - box.maxY, // 转成左上原点
            "w": box.width,
            "h": box.height,
            "confidence": candidate.confidence,
          ])
        }
        promise.resolve(results)
      }
      request.recognitionLevel = .accurate
      request.usesLanguageCorrection = true
      // TikTok 文案/评论中英混排，简中 + 英文都要识别（顺序即优先级）。
      request.recognitionLanguages = ["zh-Hans", "en-US"]

      DispatchQueue.global(qos: .userInitiated).async {
        let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
        do {
          try handler.perform([request])
        } catch {
          promise.reject("E_OCR", error.localizedDescription)
        }
      }
    }
  }
}
