package de.moviebox.data

import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query
import java.util.concurrent.TimeUnit

/**
 * Builds the Retrofit client against the current base URL and token in SessionManager.
 * Rebuilt whenever those change (login, logout, server switch).
 */
object Api {
    private val json = Json { ignoreUnknownKeys = true; coerceInputValues = true }

    @Volatile private var _service: MovieBoxService? = null
    @Volatile private var _baseUrl: String = ""
    @Volatile private var _token: String = ""

    val service: MovieBoxService
        get() = _service ?: error("Not configured yet - log in first")

    val baseUrl: String get() = _baseUrl
    val token: String get() = _token

    fun rebuild(baseUrl: String, token: String) {
        _baseUrl = baseUrl
        _token = token
        if (baseUrl.isEmpty()) { _service = null; return }
        val client = OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(60, TimeUnit.SECONDS)
            .addInterceptor { chain ->
                val request = chain.request().newBuilder().apply {
                    if (token.isNotEmpty()) header("Authorization", "Bearer $token")
                }.build()
                chain.proceed(request)
            }
            .build()
        _service = Retrofit.Builder()
            .baseUrl("$baseUrl/api/")
            .client(client)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
            .create(MovieBoxService::class.java)
    }

    /** Direct stream URL used by ExoPlayer (token in query, since <video> can't set headers). */
    fun streamUrl(mediaId: String): String = "$_baseUrl/api/media/$mediaId/stream?token=$_token"
}

interface MovieBoxService {
    @GET("health") suspend fun health(): HealthResponse
    @POST("login") suspend fun login(@Body body: LoginRequest): LoginResponse
    @GET("me") suspend fun me(): MeResponse
    @POST("logout") suspend fun logout(): Map<String, Boolean>

    @GET("home") suspend fun home(): HomeResponse
    @GET("movies") suspend fun movies(): MoviesResponse
    @GET("movies/{id}") suspend fun movie(@Path("id") id: String): MovieDetailResponse
    @GET("shows") suspend fun shows(): ShowsResponse
    @GET("shows/{id}") suspend fun show(@Path("id") id: String): ShowDetailResponse

    @GET("media/{id}/resume") suspend fun getResume(@Path("id") id: String): ResumePosition
    @POST("media/{id}/resume") suspend fun postResume(@Path("id") id: String, @Body body: ResumeUpdate): Map<String, Boolean>

    @GET("search") suspend fun searchLibrary(@Query("q") q: String): SearchResponse
    @GET("discover/search") suspend fun discoverSearch(@Query("q") q: String): DiscoverResponse
    @GET("discover/trending") suspend fun discoverTrending(): DiscoverResponse

    @POST("sources/resolve") suspend fun sourcesResolve(@Body body: Map<String, String>): ResolveResponse
    @POST("sources/add") suspend fun sourcesAdd(@Body body: SourceAddRequest): AddJobResponse
    @GET("sources/jobs") suspend fun sourcesJobs(): SourceJobsResponse

    @POST("media/{id}/like") suspend fun likeMedia(@Path("id") id: String): Map<String, Boolean>
    @retrofit2.http.DELETE("media/{id}/like") suspend fun unlikeMedia(@Path("id") id: String): Map<String, Boolean>
    @retrofit2.http.DELETE("media/{id}") suspend fun deleteMedia(@Path("id") id: String): Map<String, Boolean>
    @GET("favorites") suspend fun favorites(): SearchResponse
    @GET("random") suspend fun random(): RandomResponse
    @GET("episodes/{id}/next") suspend fun episodeNext(@Path("id") id: String): NextEpisodeResponse

    @GET("discover/sources") suspend fun discoverSources(
        @Query("tmdbId") tmdbId: Long? = null,
        @Query("kind") kind: String? = null,
        @Query("title") title: String? = null,
        @Query("year") year: Int? = null,
    ): DiscoverSourcesResponse

    @POST("admin/scan") suspend fun adminScan(): Map<String, Boolean>
}
