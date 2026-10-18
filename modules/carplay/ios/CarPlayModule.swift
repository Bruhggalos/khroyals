import ExpoModulesCore

/// One row on the CarPlay screen. An empty `id` is information only (nothing happens on tap).
struct CarItem: Record {
  @Field var id: String = ""
  @Field var text: String = ""
  @Field var detail: String?
  /// An SF Symbol shown at the start of the row, like "car.fill".
  @Field var symbol: String?
  /// Ask before acting (for things that are hard to undo from the car, like cancelling a check-in).
  @Field var confirm: CarConfirm?
}

struct CarConfirm: Record {
  @Field var title: String = ""
  @Field var ok: String = ""
  @Field var cancel: String = ""
}

struct CarSection: Record {
  @Field var header: String?
  @Field var items: [CarItem] = []
}

struct CarScreen: Record {
  @Field var sections: [CarSection] = []
}

/**
 The JavaScript side of CarPlay (modules/carplay/index.ts). JavaScript decides what the car screen
 shows (src/carplay/screen.ts) and handles taps; CarPlayCenter draws it with CarPlay's templates.
 */
public class CarPlayModule: Module {
  public func definition() -> ModuleDefinition {
    Name("KHCarPlay")

    Events("onConnect", "onDisconnect", "onSelect")

    OnCreate {
      CarPlayCenter.events = self
    }

    OnDestroy {
      if CarPlayCenter.events === self { CarPlayCenter.events = nil }
    }

    Function("isConnected") {
      CarPlayCenter.connected
    }

    AsyncFunction("setScreen") { (screen: CarScreen) in
      MainActor.assumeIsolated { CarPlayCenter.shared.show(screen) }
    }.runOnQueue(.main)

    AsyncFunction("showAlert") { (message: String) in
      MainActor.assumeIsolated { CarPlayCenter.shared.alert(message) }
    }.runOnQueue(.main)
  }

  func emit(_ name: String, _ body: [String: Any] = [:]) {
    sendEvent(name, body)
  }
}
