import CarPlay
import UIKit

/**
 Draws the car line on the CarPlay screen: one list (CPListTemplate), plus alerts to confirm
 or report something. Driving task apps may only use simple templates, and nothing here is
 more than one level deep.
 */
@MainActor
final class CarPlayCenter {
  static let shared = CarPlayCenter()

  /// Where taps and connections are reported (the JavaScript module, once it has loaded).
  nonisolated(unsafe) static weak var events: CarPlayModule?
  /// Readable from the JavaScript thread.
  nonisolated(unsafe) static var connected = false

  private var interfaceController: CPInterfaceController?
  private var list: CPListTemplate?
  /// Rows waiting for the result of a tap: CarPlay shows a spinner until the next screen arrives.
  private var pending: [() -> Void] = []

  func connect(_ controller: CPInterfaceController) {
    interfaceController = controller
    Self.connected = true
    let list = CPListTemplate(title: "Car Line", sections: [
      CPListSection(items: [CPListItem(text: "Loading…", detailText: nil)]),
    ])
    self.list = list
    controller.setRootTemplate(list, animated: false, completion: nil)
    Self.events?.emit("onConnect")
  }

  func disconnect() {
    finishPending()
    interfaceController = nil
    list = nil
    Self.connected = false
    Self.events?.emit("onDisconnect")
  }

  func show(_ screen: CarScreen) {
    finishPending()
    list?.updateSections(screen.sections.map(section))
  }

  /// A message with an OK button (for example, why a check-in didn't go through).
  func alert(_ message: String) {
    guard let controller = interfaceController else { return }
    finishPending()
    let ok = CPAlertAction(title: "OK", style: .cancel) { _ in controller.dismissTemplate(animated: true, completion: nil) }
    present(CPAlertTemplate(titleVariants: [message], actions: [ok]))
  }

  private func section(_ s: CarSection) -> CPListSection {
    CPListSection(items: s.items.map(item), header: s.header, sectionIndexTitle: nil)
  }

  private func item(_ row: CarItem) -> CPListItem {
    let image = row.symbol.flatMap { UIImage(systemName: $0) }
    let item = CPListItem(text: row.text, detailText: row.detail, image: image)
    guard !row.id.isEmpty else { return item }
    item.handler = { [weak self] _, done in
      MainActor.assumeIsolated { self?.tapped(row, done: done) }
    }
    return item
  }

  private func tapped(_ row: CarItem, done: @escaping () -> Void) {
    guard let confirm = row.confirm else {
      pending.append(done)
      Self.events?.emit("onSelect", ["id": row.id])
      // Don't leave a spinner if JavaScript never answers.
      DispatchQueue.main.asyncAfter(deadline: .now() + 10) { [weak self] in self?.finishPending() }
      return
    }
    done()
    guard let controller = interfaceController else { return }
    let yes = CPAlertAction(title: confirm.ok, style: .destructive) { _ in
      controller.dismissTemplate(animated: true, completion: nil)
      Self.events?.emit("onSelect", ["id": row.id])
    }
    let no = CPAlertAction(title: confirm.cancel, style: .cancel) { _ in controller.dismissTemplate(animated: true, completion: nil) }
    present(CPAlertTemplate(titleVariants: [confirm.title], actions: [yes, no]))
  }

  private func present(_ template: CPTemplate) {
    guard let controller = interfaceController else { return }
    // Only one alert at a time.
    if controller.presentedTemplate != nil {
      controller.dismissTemplate(animated: false) { _, _ in controller.presentTemplate(template, animated: true, completion: nil) }
    } else {
      controller.presentTemplate(template, animated: true, completion: nil)
    }
  }

  private func finishPending() {
    let done = pending
    pending = []
    done.forEach { $0() }
  }
}

/**
 The CarPlay scene delegate. Info.plist names the app's subclass (added by plugins/withCarPlay.js),
 which overrides `startJavaScriptIfNeeded()`: CarPlay can launch the app without its phone window,
 and then nothing else would start React Native.
 */
open class CarPlaySceneDelegateBase: UIResponder, CPTemplateApplicationSceneDelegate {
  /// Start React Native if the phone app isn't running. The app's subclass does this.
  open func startJavaScriptIfNeeded() {}

  public func templateApplicationScene(
    _ templateApplicationScene: CPTemplateApplicationScene,
    didConnect interfaceController: CPInterfaceController
  ) {
    CarPlayCenter.shared.connect(interfaceController)
    startJavaScriptIfNeeded()
  }

  public func templateApplicationScene(
    _ templateApplicationScene: CPTemplateApplicationScene,
    didDisconnectInterfaceController interfaceController: CPInterfaceController
  ) {
    CarPlayCenter.shared.disconnect()
  }
}
