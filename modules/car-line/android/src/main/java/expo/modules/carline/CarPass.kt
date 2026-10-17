package expo.modules.carline

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/** The parent's car pass (kept in the app's private storage) and the two calls it allows. */
object CarPass {
  private const val PREFS = "khroyals_car_line"

  data class Pass(val url: String, val key: String, val token: String)

  data class Child(val name: String, val number: String?, val status: String, val position: Int?)

  /** Today's car line for the parent's children; line is "open", "early" or "closed". */
  data class Status(val line: String, val children: List<Child>)

  class CarLineException(message: String) : Exception(message)

  fun save(ctx: Context, url: String, key: String, token: String) {
    ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
      .putString("url", url).putString("key", key).putString("token", token).apply()
  }

  fun clear(ctx: Context) {
    ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply()
  }

  fun load(ctx: Context): Pass? {
    val p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val url = p.getString("url", null) ?: return null
    val key = p.getString("key", null) ?: return null
    val token = p.getString("token", null) ?: return null
    return Pass(url, key, token)
  }

  fun status(pass: Pass): Status = parse(call(pass, "car_carline_status"))

  /** "I'm here" from where the phone is; the server checks it's within the pickup radius. */
  fun checkIn(pass: Pass, lat: Double, lng: Double, accuracy: Float?): Status =
    parse(call(pass, "car_carline_check_in", JSONObject().put("p_lat", lat).put("p_lng", lng)
      .put("p_accuracy", accuracy?.toDouble() ?: JSONObject.NULL)))

  private fun parse(body: String): Status {
    val o = JSONObject(body)
    val kids = o.optJSONArray("children") ?: JSONArray()
    return Status(
      line = o.optJSONObject("line")?.optString("state") ?: "closed",
      children = (0 until kids.length()).map { i ->
        val c = kids.getJSONObject(i)
        Child(c.optString("name"), if (c.isNull("number")) null else c.optString("number"), c.optString("status", "none"),
          if (c.isNull("position")) null else c.optInt("position"))
      },
    )
  }

  /** POST a database function with the pass; throws CarLineException with a readable reason. */
  private fun call(pass: Pass, fn: String, params: JSONObject = JSONObject()): String {
    val conn = try {
      (URL("${pass.url}/rest/v1/rpc/$fn").openConnection() as HttpURLConnection).apply {
        requestMethod = "POST"
        connectTimeout = 15000
        readTimeout = 15000
        doOutput = true
        setRequestProperty("apikey", pass.key)
        setRequestProperty("Content-Type", "application/json")
        outputStream.use { it.write(params.put("p_token", pass.token).toString().toByteArray()) }
      }
    } catch (e: Exception) {
      throw CarLineException("No connection. Try again in a moment.")
    }
    try {
      val code = conn.responseCode
      val stream = if (code in 200..299) conn.inputStream else conn.errorStream
      val body = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
      if (code in 200..299) return body
      val message = try { JSONObject(body).optString("message") } catch (e: Exception) { "" }
      throw CarLineException(message.ifEmpty { "Something went wrong ($code)." })
    } catch (e: CarLineException) {
      throw e
    } catch (e: Exception) {
      throw CarLineException("No connection. Try again in a moment.")
    } finally {
      conn.disconnect()
    }
  }
}
