package expo.modules.carline

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** Lets the app hand the car screen its car pass (and take it back on sign-out). */
class CarLineModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("CarLine")

    Function("setPass") { url: String, key: String, token: String ->
      CarPass.save(appContext.reactContext ?: throw IllegalStateException("No context"), url, key, token)
    }

    Function("clearPass") {
      appContext.reactContext?.let { CarPass.clear(it) }
    }

    Function("token") {
      appContext.reactContext?.let { CarPass.load(it)?.token }
    }
  }
}
