package expo.modules.carline

import android.content.Intent
import android.content.pm.ApplicationInfo
import android.os.Handler
import android.os.Looper
import androidx.car.app.CarAppService
import androidx.car.app.CarContext
import androidx.car.app.Screen
import androidx.car.app.Session
import androidx.car.app.model.Action
import androidx.car.app.model.CarColor
import androidx.car.app.model.MessageTemplate
import androidx.car.app.model.Pane
import androidx.car.app.model.PaneTemplate
import androidx.car.app.model.Row
import androidx.car.app.model.Template
import androidx.car.app.validation.HostValidator
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import kotlin.concurrent.thread

/**
 * Android Auto: the car line on the car's screen. Parents see whether each
 * child is checked in, waiting (with their place in line) or picked up, and
 * tap "I'm here" to check in. It uses the car pass the phone app saved at
 * sign-in (CarPass), so it works without opening the phone.
 */
class CarLineCarService : CarAppService() {
  override fun createHostValidator(): HostValidator =
    if (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0) {
      HostValidator.ALLOW_ALL_HOSTS_VALIDATOR
    } else {
      // Android Auto, Android Automotive and Google's desktop head unit.
      HostValidator.Builder(applicationContext).addAllowedHosts(androidx.car.app.R.array.hosts_allowlist_sample).build()
    }

  @Suppress("OVERRIDE_DEPRECATION", "DEPRECATION")
  override fun onCreateSession(): Session = object : Session() {
    override fun onCreateScreen(intent: Intent): Screen = CarLineScreen(carContext)
  }
}

class CarLineScreen(carContext: CarContext) : Screen(carContext), DefaultLifecycleObserver {
  private val main = Handler(Looper.getMainLooper())
  private var status: CarPass.Status? = null
  private var error: String? = null
  private var busy = false
  private val refresher = object : Runnable {
    override fun run() {
      fetch { CarPass.status(it) }
      main.postDelayed(this, REFRESH_MS)
    }
  }

  init {
    lifecycle.addObserver(this)
  }

  override fun onStart(owner: LifecycleOwner) {
    main.post(refresher)
  }

  override fun onStop(owner: LifecycleOwner) {
    main.removeCallbacks(refresher)
  }

  private fun fetch(work: (CarPass.Pass) -> CarPass.Status) {
    val pass = CarPass.load(carContext)
    if (pass == null) {
      status = null
      invalidate()
      return
    }
    thread {
      try {
        val s = work(pass)
        main.post { status = s; error = null; busy = false; invalidate() }
      } catch (e: CarPass.CarLineException) {
        main.post { error = e.message; busy = false; invalidate() }
      } catch (e: Exception) {
        main.post { error = "Something went wrong. Try again."; busy = false; invalidate() }
      }
    }
  }

  override fun onGetTemplate(): Template {
    if (CarPass.load(carContext) == null) {
      return MessageTemplate.Builder("Open KH Royals on your phone and log in as a parent to use the car line here.")
        .setTitle("Car line")
        .setHeaderAction(Action.APP_ICON)
        .build()
    }
    val s = status
    if (s == null && error == null) {
      return PaneTemplate.Builder(Pane.Builder().setLoading(true).build())
        .setTitle("Car line")
        .setHeaderAction(Action.APP_ICON)
        .build()
    }

    val pane = Pane.Builder()
    error?.let { pane.addRow(Row.Builder().setTitle("⚠️ $it").build()) }
    s?.children?.forEach { c ->
      pane.addRow(Row.Builder().setTitle(c.name).addText(describe(c)).build())
    }
    if (s != null && s.children.isEmpty()) {
      pane.addRow(Row.Builder().setTitle("No children are linked to your account yet").build())
    }
    if (error == null && s == null) pane.setLoading(true)

    val canCheckIn = s != null && s.line != "closed" && s.children.any { it.status == "none" }
    if (canCheckIn) {
      pane.addAction(
        Action.Builder()
          .setTitle(if (busy) "Checking in…" else "I'm here")
          .setBackgroundColor(CarColor.GREEN)
          .setOnClickListener {
            if (!busy) {
              busy = true
              invalidate()
              fetch { CarPass.checkIn(it) }
            }
          }
          .build(),
      )
    }
    pane.addAction(Action.Builder().setTitle("Refresh").setOnClickListener { fetch { CarPass.status(it) } }.build())

    val title = when (s?.line) {
      "open" -> "Car line · Open"
      "early" -> "Car line · Opens soon"
      "closed" -> "Car line · Closed"
      else -> "Car line"
    }
    return PaneTemplate.Builder(pane.build()).setTitle(title).setHeaderAction(Action.APP_ICON).build()
  }

  private fun describe(c: CarPass.Child): String = when (c.status) {
    "waiting" -> if (c.position != null) "Waiting · #${c.position} in line" else "Waiting"
    "picked_up" -> "Picked up ✓"
    else -> "Not checked in"
  }

  companion object {
    private const val REFRESH_MS = 20_000L
  }
}
