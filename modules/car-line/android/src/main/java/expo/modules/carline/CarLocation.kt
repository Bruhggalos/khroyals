package expo.modules.carline

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import android.os.Build
import android.os.SystemClock
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/** The phone's current position for "I'm here" (call off the main thread). Null without permission or a fix. */
object CarLocation {
  private const val MAX_AGE_NANOS = 120_000_000_000L   // a fix from the last two minutes is fine

  fun hasPermission(ctx: Context) =
    ctx.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
      ctx.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

  @SuppressLint("MissingPermission")
  fun current(ctx: Context): Location? {
    if (!hasPermission(ctx)) return null
    val lm = ctx.getSystemService(Context.LOCATION_SERVICE) as LocationManager
    val providers = listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER).filter {
      try { lm.isProviderEnabled(it) } catch (e: Exception) { false }
    }
    val now = SystemClock.elapsedRealtimeNanos()
    val recent = providers.mapNotNull { try { lm.getLastKnownLocation(it) } catch (e: Exception) { null } }
      .filter { now - it.elapsedRealtimeNanos < MAX_AGE_NANOS }
      .minByOrNull { if (it.hasAccuracy()) it.accuracy else Float.MAX_VALUE }
    if (recent != null) return recent
    if (Build.VERSION.SDK_INT >= 30 && providers.isNotEmpty()) {
      val latch = CountDownLatch(1)
      var fix: Location? = null
      val pool = Executors.newSingleThreadExecutor()
      try {
        lm.getCurrentLocation(providers.first(), null, pool) { fix = it; latch.countDown() }
        latch.await(15, TimeUnit.SECONDS)
      } catch (e: Exception) {
        // fall through to whatever the phone last knew
      } finally {
        pool.shutdown()
      }
      if (fix != null) return fix
    }
    return providers.mapNotNull { try { lm.getLastKnownLocation(it) } catch (e: Exception) { null } }.maxByOrNull { it.elapsedRealtimeNanos }
  }
}
