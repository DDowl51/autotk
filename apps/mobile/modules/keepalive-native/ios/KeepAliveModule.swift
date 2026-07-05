import ExpoModulesCore
import CoreLocation

// 持续后台定位保活（原理同 AScript）：
// 用原生 CLLocationManager 开「持续」定位更新——allowsBackgroundLocationUpdates=true、
// pausesLocationUpdatesAutomatically=false、高精度、距离过滤 None——iOS 因此不挂起进程，
// RN 引擎得以在后台/锁屏持续运行。比 expo-location 的后台任务式 API（只无头唤醒、主线程仍被挂起）可靠。
//
// 依赖：app.json 的 ios.infoPlist.UIBackgroundModes 含 "location"，且已授予「始终」定位权限。
public class KeepAliveModule: Module {
  private var manager: CLLocationManager?
  private let delegate = KeepAliveDelegate()

  public func definition() -> ModuleDefinition {
    Name("KeepAlive")

    AsyncFunction("start") {
      DispatchQueue.main.async {
        if self.manager == nil {
          let m = CLLocationManager()
          m.delegate = self.delegate
          self.manager = m
        }
        guard let m = self.manager else { return }
        m.requestAlwaysAuthorization()
        m.desiredAccuracy = kCLLocationAccuracyBest
        m.distanceFilter = kCLDistanceFilterNone
        m.pausesLocationUpdatesAutomatically = false
        m.allowsBackgroundLocationUpdates = true
        m.showsBackgroundLocationIndicator = false
        m.startUpdatingLocation()
      }
    }

    AsyncFunction("stop") {
      DispatchQueue.main.async {
        self.manager?.stopUpdatingLocation()
      }
    }
  }
}

private class KeepAliveDelegate: NSObject, CLLocationManagerDelegate {
  // 空实现：目的只是让 GPS 持续工作、进程不被挂起，不需要真的处理位置。
  func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {}
  func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {}
}
