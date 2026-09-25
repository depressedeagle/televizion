import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import Hls from 'hls.js'
import type { MovieDetail, Season, Episode } from '../types/movie'
import {
  saveWatchProgress,
  getWatchProgress,
  markEpisodeWatched,
  formatWatchTime,
} from '../services/watchProgress'
import { getKinopoiskId } from '../services/kinopoiskMapping'
import { pushBackHandler } from '../utils/tvBackHandler'
import { getPosterUrlWithFallback } from '../utils/imageOptimizer'
import { extractStream, getProxiedHlsUrl } from '../services/streamApi'
import './RezkaPlayer.css'

export type VideoQuality = '1080p' | '720p' | '480p'

export function formatQualityLabel(height?: number, width = 0): string {
  if (!height && !width) return 'Авто'
  const h = height || 0
  const w = width || 0
  if (h >= 800 || w >= 1800) return '1080p Full HD'
  if (h >= 576 || w >= 1100) return '720p HD'
  if (h >= 432 || w >= 720) return '480p'
  if (h >= 300 || w >= 480) return '360p'
  return `${h}p`
}

interface MoviePlayerProps {
  movie: MovieDetail
  onBack: () => void
}

export function RezkaPlayer({ movie, onBack }: MoviePlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const watchBtnRef = useRef<HTMLButtonElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const hudTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const kpId = getKinopoiskId(movie)
  const [isSeriesFromStream, setIsSeriesFromStream] = useState(false)
  const isSeries = Boolean(movie.isSeries || isSeriesFromStream || (movie.seasons && movie.seasons.length > 0))

  // Режим экрана: 'overview' (карточка фильма) | 'watching' (полноэкранный просмотр)
  const [viewMode, setViewMode] = useState<'overview' | 'watching'>('overview')

  // Восстановление сохраненного прогресса
  const savedProgress = useMemo(() => getWatchProgress(movie.id), [movie.id])
  const [currentWatchTime, setCurrentWatchTime] = useState<number>(savedProgress?.currentTime || 0)
  const [totalDuration, setTotalDuration] = useState<number>(savedProgress?.duration || 0)

  // HLS поток
  const [hlsUrl, setHlsUrl] = useState<string>('')
  const [streamLoading, setStreamLoading] = useState(false)
  const [streamError, setStreamError] = useState<string | null>(null)
  const [isBuffering, setIsBuffering] = useState(false)

  // Сезоны и серии
  const [seasons, setSeasons] = useState<Season[]>(movie.seasons || [])
  const [episodes, setEpisodes] = useState<Episode[]>(movie.episodes || [])
  const [selectedSeason, setSelectedSeason] = useState<string>(() => {
    if (savedProgress?.season) return String(savedProgress.season)
    return movie.seasons?.[0]?.id || '1'
  })
  const [selectedEpisode, setSelectedEpisode] = useState<string>(() => {
    if (savedProgress?.episode) return String(savedProgress.episode)
    return movie.episodes?.[0]?.episodeId || '1'
  })

  // Озвучки / Аудиодорожки
  const [audioTracks, setAudioTracks] = useState<string[]>([])
  const [selectedAudioIdx, setSelectedAudioIdx] = useState(0)
  const [isAudioDrawerOpen, setIsAudioDrawerOpen] = useState(false)
  const [isEpisodesDrawerOpen, setIsEpisodesDrawerOpen] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)

  // Постер и фон: каскадный fallback при блокировке TMDB CDN
  const [posterStage, setPosterStage] = useState(0)
  const [posterError, setPosterError] = useState(false)

  // Полноэкранный HUD в режиме watching
  const [isWatchingHudVisible, setIsWatchingHudVisible] = useState(true)
  const [osdMessage, setOsdMessage] = useState<string | null>(null)
  const osdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // HLS quality levels
  const [hlsLevels, setHlsLevels] = useState<{ height: number; bitrate: number; width?: number }[]>([])
  const [currentLevel, setCurrentLevel] = useState(-1) // -1 = auto

  // Часы
  const [clockTime, setClockTime] = useState(() => {
    const now = new Date()
    return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
  })

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date()
      setClockTime(
        `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
      )
    }, 15000)
    return () => clearInterval(timer)
  }, [])

  const showOsd = useCallback((msg: string) => {
    setOsdMessage(msg)
    if (osdTimerRef.current) clearTimeout(osdTimerRef.current)
    osdTimerRef.current = setTimeout(() => setOsdMessage(null), 2500)
  }, [])

  // Автоскрытие панели управления
  const resetWatchingHudTimer = useCallback(() => {
    setIsWatchingHudVisible(true)
    if (hudTimerRef.current) clearTimeout(hudTimerRef.current)
    hudTimerRef.current = setTimeout(() => {
      if (!isAudioDrawerOpen && !isEpisodesDrawerOpen) {
        setIsWatchingHudVisible(false)
      }
    }, 4000)
  }, [isAudioDrawerOpen, isEpisodesDrawerOpen])

  // Сохранение прогресса просмотра
  const persistProgress = useCallback(
    (curTime: number) => {
      if (!movie.id) return
      saveWatchProgress({
        movieId: movie.id,
        movieTitle: movie.title,
        moviePoster: movie.poster,
        isSeries,
        season: isSeries ? Number(selectedSeason) : undefined,
        episode: isSeries ? Number(selectedEpisode) : undefined,
        currentTime: curTime,
        duration: totalDuration > 0 ? totalDuration : undefined,
      })

      if (isSeries && selectedSeason && selectedEpisode) {
        markEpisodeWatched(movie.id, selectedSeason, selectedEpisode)
      }
    },
    [movie.id, movie.title, movie.poster, isSeries, selectedSeason, selectedEpisode, totalDuration]
  )

  // ==========================================
  //  ЗАГРУЗКА HLS-ПОТОКА С СЕРВЕРА
  // ==========================================
  const loadStream = useCallback(
    async (seasonNum?: number, episodeNum?: number) => {
      setStreamLoading(true)
      setStreamError(null)

      try {
        const result = await extractStream({
          kinopoiskId: kpId || undefined,
          imdbId: movie.imdbId || undefined,
          title: movie.title,
          season: seasonNum || Number(selectedSeason),
          episode: episodeNum || Number(selectedEpisode),
        })

        if (result.success && result.hls) {
          setHlsUrl(result.hls)

          if (result.isSeries) {
            setIsSeriesFromStream(true)
          }

          // Обновляем список озвучек
          if (result.audioTracks && result.audioTracks.length > 0) {
            setAudioTracks(result.audioTracks)
            setSelectedAudioIdx(0)
          }

          // Обновляем список сезонов и серий из потока
          if (result.isSeries && result.seasons && result.seasons.length > 0) {
            setSeasons(
              result.seasons.map((s) => ({
                id: String(s.season),
                name: `Сезон ${s.season}`,
              }))
            )
            // Обновляем серии для текущего сезона
            const curSeason = result.seasons.find(
              (s) => String(s.season) === String(seasonNum || selectedSeason)
            )
            if (curSeason) {
              setEpisodes(
                curSeason.episodes.map((e) => ({
                  seasonId: String(curSeason.season),
                  episodeId: e.episode,
                  name: `Серия ${e.episode}`,
                }))
              )
            }
          }
        } else {
          setStreamError(result.error || 'HLS поток не найден')
        }
      } catch (err) {
        setStreamError('Ошибка загрузки потока')
        console.error('[RezkaPlayer] Stream loading error:', err)
      } finally {
        setStreamLoading(false)
      }
    },
    [kpId, movie.imdbId, movie.title, selectedSeason, selectedEpisode]
  )

  // Сброс состояния и загрузка потока при открытии или смене фильма
  useEffect(() => {
    setHlsUrl('')
    setStreamError(null)
    setHlsLevels([])
    setCurrentLevel(-1)
    setAudioTracks([])
    setSelectedAudioIdx(0)
    setPosterStage(0)
    setPosterError(false)
    setIsSeriesFromStream(false)
    setViewMode('overview')
    setIsPlaying(false)
    if (videoRef.current) {
      videoRef.current.pause()
      videoRef.current.removeAttribute('src')
      videoRef.current.load()
    }
    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }
    loadStream()
  }, [movie.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ==========================================
  //  ИНИЦИАЛИЗАЦИЯ HLS.js + <video>
  // ==========================================
  useEffect(() => {
    if (viewMode !== 'watching' || !hlsUrl) return

    const video = videoRef.current
    if (!video) return

    const proxiedUrl = getProxiedHlsUrl(hlsUrl, audioTracks)

    // Уничтожаем предыдущий экземпляр HLS
    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }

    if (Hls.isSupported()) {
      const hls = new Hls({
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        startPosition: currentWatchTime > 5 ? currentWatchTime : -1,
        enableWorker: true,
      })

      hls.loadSource(proxiedUrl)
      hls.attachMedia(video)

      hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
        // Собираем уровни качества с разрешением
        const levels = data.levels.map((l) => ({
          height: l.height,
          bitrate: l.bitrate,
          width: l.width,
        }))
        setHlsLevels(levels)
        setCurrentLevel(-1) // auto

        // Применяем выбранную аудиодорожку сразу при старте
        if (hls.audioTracks && hls.audioTracks.length > selectedAudioIdx) {
          hls.audioTrack = selectedAudioIdx
        }

        // Начинаем воспроизведение
        video.play().catch(() => {
          // Autoplay заблокирован — показываем кнопку
        })
      })

      hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
        setCurrentLevel(data.level)
      })

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.warn('[HLS] Network error, attempting recovery...')
              hls.startLoad()
              break
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.warn('[HLS] Media error, attempting recovery...')
              hls.recoverMediaError()
              break
            default:
              console.error('[HLS] Fatal error:', data)
              setStreamError('Ошибка воспроизведения видео')
              hls.destroy()
              break
          }
        }
      })

      // Обновление и синхронизация аудиодорожек
      hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, (_event, data) => {
        if (data.audioTracks && data.audioTracks.length > 0) {
          const names = data.audioTracks.map((t) => t.name)
          setAudioTracks(names)
          if (selectedAudioIdx >= 0 && selectedAudioIdx < data.audioTracks.length) {
            hls.audioTrack = selectedAudioIdx
          }
        }
      })

      hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, (_event, data) => {
        setSelectedAudioIdx(data.id)
      })

      hlsRef.current = hls
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Нативная поддержка HLS (Safari, iOS, некоторые Smart TV)
      video.src = proxiedUrl
      if (currentWatchTime > 5) {
        video.currentTime = currentWatchTime
      }
      video.play().catch(() => {})
    } else {
      setStreamError('Браузер не поддерживает HLS воспроизведение')
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }
    }
  }, [viewMode, hlsUrl]) // eslint-disable-line react-hooks/exhaustive-deps

  // Переключение аудиодорожки через HLS.js
  const handleSelectAudio = useCallback(
    (idx: number) => {
      setSelectedAudioIdx(idx)
      if (hlsRef.current && hlsRef.current.audioTracks && hlsRef.current.audioTracks.length > idx) {
        hlsRef.current.audioTrack = idx
      }
      setIsAudioDrawerOpen(false)
      resetWatchingHudTimer()
      const name = audioTracks[idx] || `Озвучка #${idx + 1}`
      showOsd(`🎙 Озвучка: ${name}`)
    },
    [audioTracks, resetWatchingHudTimer, showOsd]
  )

  useEffect(() => {
    if (!hlsRef.current) return
    const hls = hlsRef.current
    if (hls.audioTracks && hls.audioTracks.length > selectedAudioIdx) {
      hls.audioTrack = selectedAudioIdx
    }
  }, [selectedAudioIdx])

  // ==========================================
  //  ОБРАБОТКА СОБЫТИЙ <video>
  // ==========================================
  useEffect(() => {
    const video = videoRef.current
    if (!video || viewMode !== 'watching') return

    const onPlay = () => setIsPlaying(true)
    const onPause = () => setIsPlaying(false)
    const onDurationChange = () => {
      if (video.duration && isFinite(video.duration)) {
        setTotalDuration(video.duration)
      }
    }
    const onWaiting = () => setIsBuffering(true)
    const onCanPlay = () => setIsBuffering(false)
    const onPlaying = () => {
      setIsBuffering(false)
      setIsPlaying(true)
    }
    const onEnded = () => {
      setIsPlaying(false)
      persistProgress(video.currentTime)
      // Если сериал — автоматически переключаем на следующую серию
      if (isSeries) {
        const currentEpIdx = episodes.findIndex((e) => e.episodeId === selectedEpisode)
        if (currentEpIdx >= 0 && currentEpIdx < episodes.length - 1) {
          const nextEp = episodes[currentEpIdx + 1]
          setSelectedEpisode(nextEp.episodeId)
          showOsd(`📺 Следующая серия: ${nextEp.name}`)
          loadStream(Number(selectedSeason), Number(nextEp.episodeId))
        }
      }
    }

    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)
    video.addEventListener('durationchange', onDurationChange)
    video.addEventListener('waiting', onWaiting)
    video.addEventListener('canplay', onCanPlay)
    video.addEventListener('playing', onPlaying)
    video.addEventListener('ended', onEnded)

    return () => {
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('durationchange', onDurationChange)
      video.removeEventListener('waiting', onWaiting)
      video.removeEventListener('canplay', onCanPlay)
      video.removeEventListener('playing', onPlaying)
      video.removeEventListener('ended', onEnded)
    }
  }, [viewMode, selectedEpisode, episodes, isSeries, selectedSeason, loadStream, showOsd, persistProgress])

  // Таймер обновления времени воспроизведения
  useEffect(() => {
    if (viewMode !== 'watching') {
      if (progressTimerRef.current) clearInterval(progressTimerRef.current)
      return
    }

    progressTimerRef.current = setInterval(() => {
      const video = videoRef.current
      if (video && !video.paused && isFinite(video.currentTime)) {
        setCurrentWatchTime(video.currentTime)
      }
    }, 500)

    return () => {
      if (progressTimerRef.current) clearInterval(progressTimerRef.current)
    }
  }, [viewMode])

  // Периодическое сохранение прогресса
  useEffect(() => {
    if (viewMode !== 'watching') return
    const saveInterval = setInterval(() => {
      const video = videoRef.current
      if (video && isFinite(video.currentTime) && video.currentTime > 5) {
        persistProgress(video.currentTime)
      }
    }, 10000) // каждые 10 секунд
    return () => clearInterval(saveInterval)
  }, [viewMode, persistProgress])

  // Перемотка
  const handleSeek = useCallback(
    (deltaSeconds: number) => {
      resetWatchingHudTimer()
      const video = videoRef.current
      if (!video) return

      const maxTime = video.duration && isFinite(video.duration) ? video.duration : 7200
      const targetTime = Math.max(0, Math.min(maxTime, video.currentTime + deltaSeconds))
      video.currentTime = targetTime
      setCurrentWatchTime(targetTime)

      const sign = deltaSeconds > 0 ? '+' : ''
      const icon = deltaSeconds > 0 ? '⏩' : '⏪'
      showOsd(`${icon} ${formatWatchTime(targetTime)} (${sign}${deltaSeconds} сек)`)
    },
    [resetWatchingHudTimer, showOsd]
  )

  // Перемотка к абсолютному времени
  const handleSeekToAbsolute = useCallback(
    (targetSeconds: number) => {
      resetWatchingHudTimer()
      const video = videoRef.current
      if (!video) return

      const maxTime = video.duration && isFinite(video.duration) ? video.duration : 7200
      const targetTime = Math.max(0, Math.min(maxTime, targetSeconds))
      video.currentTime = targetTime
      setCurrentWatchTime(targetTime)
      showOsd(`⏱ ${formatWatchTime(targetTime)}`)
    },
    [resetWatchingHudTimer, showOsd]
  )

  // Play / Pause
  const togglePlayPause = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      video.play().catch(() => {})
      showOsd('▶ Воспроизведение')
    } else {
      video.pause()
      showOsd('⏸ Пауза')
    }
    resetWatchingHudTimer()
  }, [showOsd, resetWatchingHudTimer])

  // Запуск просмотра
  const handleStartWatching = useCallback(
    (timeToStart = currentWatchTime) => {
      if (!hlsUrl) {
        if (streamLoading) {
          showOsd('⏳ Загрузка видеопотока, подождите...')
          return
        }
        showOsd(
          movie.year && Number(movie.year) >= 2025
            ? '📅 Фильм еще не вышел в цифровой релиз'
            : '⚠️ Прямой видеопоток пока недоступен'
        )
        return
      }

      setCurrentWatchTime(timeToStart)
      setViewMode('watching')
      setIsPlaying(true)
      resetWatchingHudTimer()
      showOsd('🌟 Воспроизведение...')

      // Перемотка к нужному времени после начала воспроизведения
      setTimeout(() => {
        const video = videoRef.current
        if (video && timeToStart > 5) {
          video.currentTime = timeToStart
        }
      }, 500)
    },
    [currentWatchTime, hlsUrl, movie.year, streamLoading, resetWatchingHudTimer, showOsd]
  )

  // Переключение качества через HLS.js
  const handleQualitySwitch = useCallback(
    (levelIdx: number) => {
      if (!hlsRef.current) return
      hlsRef.current.currentLevel = levelIdx
      setCurrentLevel(levelIdx)
      const label =
        levelIdx === -1
          ? 'Авто'
          : hlsLevels[levelIdx]
          ? formatQualityLabel(hlsLevels[levelIdx].height, hlsLevels[levelIdx].width)
          : `Уровень ${levelIdx}`
      showOsd(`🌟 Качество: ${label}`)
    },
    [hlsLevels, showOsd]
  )

  // Получить текущую метку качества
  const currentQualityLabel = useMemo(() => {
    if (currentLevel === -1) return 'Авто'
    const lvl = hlsLevels[currentLevel]
    if (lvl) return formatQualityLabel(lvl.height, lvl.width)
    return 'Авто'
  }, [currentLevel, hlsLevels])

  // Максимальное разрешение доступного потока
  const maxStreamQuality = useMemo(() => {
    if (hlsLevels.length === 0) return null
    let maxH = 0
    let maxW = 0
    for (const l of hlsLevels) {
      if (l.height > maxH) maxH = l.height
      if ((l.width || 0) > maxW) maxW = l.width || 0
    }
    return formatQualityLabel(maxH, maxW)
  }, [hlsLevels])

  // Фокусировка при переключении режима
  useEffect(() => {
    if (viewMode === 'overview') {
      const timer = setTimeout(() => {
        watchBtnRef.current?.focus()
      }, 150)
      return () => clearTimeout(timer)
    }
  }, [viewMode])

  // КНОПКА "НАЗАД" ДЛЯ ПУЛЬТА SMART TV
  useEffect(() => {
    const unregister = pushBackHandler(() => {
      if (isEpisodesDrawerOpen) {
        setIsEpisodesDrawerOpen(false)
        resetWatchingHudTimer()
        return true
      }

      if (isAudioDrawerOpen) {
        setIsAudioDrawerOpen(false)
        resetWatchingHudTimer()
        return true
      }

      if (viewMode === 'watching') {
        // Ставим на паузу и выходим обратно в карточку
        const video = videoRef.current
        if (video) {
          video.pause()
          persistProgress(video.currentTime)
        }
        setViewMode('overview')
        setIsPlaying(false)
        setTimeout(() => watchBtnRef.current?.focus(), 150)
        return true
      }

      // Выходим из карточки фильма в каталог
      persistProgress(currentWatchTime)
      onBack()
      return true
    })

    return () => unregister()
  }, [isAudioDrawerOpen, isEpisodesDrawerOpen, viewMode, currentWatchTime, onBack, persistProgress, resetWatchingHudTimer])

  // Клавиши пульта Smart TV в режиме просмотра
  useEffect(() => {
    if (viewMode !== 'watching') return

    const handleKeyDown = (e: KeyboardEvent) => {
      // Стрелка влево -> Перемотка назад (-10 сек)
      if (e.key === 'ArrowLeft' || e.keyCode === 37 || e.key === 'MediaRewind') {
        e.preventDefault()
        handleSeek(-10)
        return
      }

      // Стрелка вправо -> Перемотка вперед (+10 сек)
      if (e.key === 'ArrowRight' || e.keyCode === 39 || e.key === 'MediaFastForward') {
        e.preventDefault()
        handleSeek(10)
        return
      }

      // Play / Pause (Enter, Пробел, MediaPlayPause)
      if (
        e.key === 'Enter' || e.keyCode === 13 ||
        e.key === 'MediaPlayPause' ||
        e.key === 'MediaPlay' ||
        e.key === 'MediaPause' ||
        e.key === ' ' || e.keyCode === 32 ||
        e.keyCode === 179 ||
        e.key === 'k' || e.key === 'K'
      ) {
        e.preventDefault()
        togglePlayPause()
        return
      }

      // Стрелка вверх / вниз -> показать HUD
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.keyCode === 38 || e.keyCode === 40) {
        resetWatchingHudTimer()
      }

      // Escape -> выйти из плеера
      if (e.key === 'Escape' || e.keyCode === 27) {
        e.preventDefault()
        const video = videoRef.current
        if (video) {
          video.pause()
          persistProgress(video.currentTime)
        }
        setViewMode('overview')
        setIsPlaying(false)
        setTimeout(() => watchBtnRef.current?.focus(), 150)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [viewMode, handleSeek, togglePlayPause, resetWatchingHudTimer, persistProgress])

  // Постер и фон: каскадный fallback при блокировке TMDB CDN
  const posterUrl = movie.poster && !posterError ? getPosterUrlWithFallback(movie.poster, posterStage) : ''
  const backdropUrl = movie.poster && !posterError ? getPosterUrlWithFallback(movie.poster, posterStage) : ''
  const selectedTrackName = audioTracks[selectedAudioIdx] || 'Озвучка'

  // Прогресс-бар в %
  const progressPercent = totalDuration > 0 ? Math.min(100, Math.max(0, (currentWatchTime / totalDuration) * 100)) : 0

  return (
    <div ref={containerRef} className="kp-hub-container">
      {/* ====================================================
          ФАЗА 1: КАРТОЧКА ФИЛЬМА В СТИЛЕ КИНОПОИСКА
          ==================================================== */}
      {viewMode === 'overview' && (
        <div className="kp-overview-page">
          {/* Фоновый постер с градиентным затемнением */}
          {backdropUrl && (
            <div
              className="kp-backdrop-bg"
              style={{ backgroundImage: `url(${backdropUrl})` }}
              aria-hidden="true"
            />
          )}
          <div className="kp-backdrop-vignette" aria-hidden="true" />

          {/* Верхняя панель карточки */}
          <header className="kp-overview-header">
            <button
              type="button"
              className="kp-back-btn"
              onClick={onBack}
              title="Вернуться в каталог фильмов (Back)"
            >
              ← В каталог фильмов (Back)
            </button>
            <span className="kp-clock">{clockTime}</span>
          </header>

          {/* Главный блок контента фильма */}
          <main className="kp-movie-content">
            {/* Постер фильма слева */}
            <div className="kp-poster-wrap">
              {posterUrl ? (
                <img
                  key={`poster-${movie.id}-${posterStage}`}
                  src={posterUrl}
                  alt={movie.title}
                  className="kp-poster-img"
                  onError={() => {
                    if (posterStage < 3) {
                      setPosterStage((prev) => prev + 1)
                    } else {
                      setPosterError(true)
                    }
                  }}
                />
              ) : (
                <div className="kp-poster-placeholder">
                  <div className="kp-poster-placeholder-inner">
                    <span className="kp-poster-placeholder-icon">🎬</span>
                    <span className="kp-poster-placeholder-title">{movie.title}</span>
                    {movie.year && <span className="kp-poster-placeholder-year">{movie.year}</span>}
                  </div>
                </div>
              )}
            </div>

            {/* Описание и кнопки справа */}
            <div className="kp-details-column">
              <h1 className="kp-title">{movie.title}</h1>
              {movie.origTitle && <h2 className="kp-orig-title">{movie.origTitle}</h2>}

              {/* Бейджи метаданных */}
              <div className="kp-meta-row">
                {streamError && !hlsUrl ? (
                  <span className="kp-badge kp-badge--pending">
                    {movie.year && Number(movie.year) >= 2025 ? '📅 Анонс / Скоро в цифре' : '⚠️ Поток недоступен'}
                  </span>
                ) : (
                  <span className={`kp-badge ${maxStreamQuality?.includes('1080') ? 'kp-badge--fhd' : 'kp-badge--hd'}`}>
                    {maxStreamQuality ? `🌟 ${maxStreamQuality}` : streamLoading ? '⏳ HD...' : '🌟 720p HD'}
                  </span>
                )}
                {movie.year && <span className="kp-badge kp-badge--year">{movie.year}</span>}
                {(movie.ratingKp || movie.ratingImdb) && (
                  <span className="kp-badge kp-badge--rating">
                    ★ Кинопоиск {movie.ratingKp || movie.ratingImdb}
                  </span>
                )}
                {movie.duration && <span className="kp-badge kp-badge--duration">{movie.duration}</span>}
                <span className="kp-badge kp-badge--cat">{movie.category || 'Фильм'}</span>
              </div>

              {movie.genres && (
                <p className="kp-genres">
                  <strong>Жанры:</strong> {movie.genres}
                </p>
              )}

              {/* Сюжет / Описание */}
              <p className="kp-description">
                {movie.description ||
                  'Захватывающая история в высоком качестве HD со студийным многоголосым дубляжем.'}
              </p>

              {/* ГЛАВНЫЕ КНОПКИ ДЕЙСТВИЯ ДЛЯ ПУЛЬТА */}
              <div className="kp-actions-row">
                <button
                  ref={watchBtnRef}
                  type="button"
                  className="kp-action-btn kp-action-btn--primary"
                  onClick={() => handleStartWatching(currentWatchTime)}
                  autoFocus
                  disabled={streamLoading || (!hlsUrl && Boolean(streamError))}
                >
                  <span className="kp-btn-icon">{streamError && !hlsUrl ? '⏳' : '▶'}</span>
                  <span className="kp-btn-text">
                    {streamLoading
                      ? 'Загрузка потока...'
                      : streamError && !hlsUrl
                        ? 'Поток пока недоступен'
                        : currentWatchTime > 15
                          ? `Продолжить с ${formatWatchTime(currentWatchTime)}`
                          : 'Смотреть'}
                  </span>
                </button>

                {currentWatchTime > 15 && hlsUrl && (
                  <button
                    type="button"
                    className="kp-action-btn kp-action-btn--secondary"
                    onClick={() => handleStartWatching(0)}
                    title="Начать воспроизведение сначала"
                  >
                    🔄 С начала
                  </button>
                )}
              </div>

              {/* Статус потока */}
              {streamError && !hlsUrl && (
                <div className="kp-stream-error">
                  {movie.year && Number(movie.year) >= 2025
                    ? `📅 Фильм «${movie.title}» (${movie.year}) еще не вышел в цифровой релиз. Видеопоток появится после премьеры в онлайн-кинотеатрах.`
                    : `⚠️ Прямой видеопоток для фильма «${movie.title}» временно не найден.`}
                  <button
                    type="button"
                    className="kp-action-btn kp-action-btn--secondary"
                    onClick={() => loadStream()}
                    style={{ marginLeft: '1rem', marginTop: '0.4rem' }}
                  >
                    🔄 Повторить попытку
                  </button>
                </div>
              )}

              {/* ВЫБОР ОЗВУЧКИ / АУДИОДОРОЖКИ */}
              {audioTracks.length > 0 && (
                <div className="kp-audio-block">
                  <div className="kp-section-header">
                    <span className="kp-section-label">🎙 Выбор озвучки (Аудиодорожка):</span>
                    <span className="kp-audio-selected-tag">{selectedTrackName}</span>
                  </div>
                  <div className="kp-audio-chips">
                    {audioTracks.map((track, idx) => (
                      <button
                        key={track}
                        type="button"
                        className={`kp-audio-chip ${selectedAudioIdx === idx ? 'kp-audio-chip--active' : ''}`}
                        onClick={() => handleSelectAudio(idx)}
                      >
                        <span className="kp-audio-chip-icon">🎙</span>
                        <span className="kp-audio-chip-text">{track}</span>
                        {selectedAudioIdx === idx && <span className="kp-audio-chip-check">✓</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ДЛЯ СЕРИАЛОВ: ВЫБОР СЕЗОНА И СЕРИИ */}
              {isSeries && (
                <div className="kp-series-section">
                  <span className="kp-section-label">📺 Выбор сезона и серии:</span>

                  {/* Сезоны */}
                  {seasons.length > 1 && (
                    <div className="kp-seasons-tabs">
                      {seasons.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          className={`kp-season-tab ${selectedSeason === s.id ? 'kp-season-tab--active' : ''}`}
                          onClick={() => {
                            setSelectedSeason(s.id)
                            loadStream(Number(s.id), 1)
                            setSelectedEpisode('1')
                          }}
                        >
                          {s.name}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Карусель серий */}
                  <div className="kp-episodes-carousel">
                    {episodes.map((ep) => (
                      <button
                        key={ep.episodeId}
                        type="button"
                        className={`kp-episode-pill ${selectedEpisode === ep.episodeId ? 'kp-episode-pill--active' : ''}`}
                        onClick={() => {
                          setSelectedEpisode(ep.episodeId)
                          loadStream(Number(selectedSeason), Number(ep.episodeId))
                        }}
                      >
                        <span className="kp-ep-label">Серия {ep.episodeId}</span>
                        {selectedEpisode === ep.episodeId && (
                          <span className="kp-ep-current">Выбрана ▶</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </main>
        </div>
      )}

      {/* ====================================================
          ФАЗА 2: НАТИВНЫЙ ПОЛНОЭКРАННЫЙ HLS-ПЛЕЕР
          ==================================================== */}
      {viewMode === 'watching' && (
        <div
          className="kp-watching-page"
          onMouseMove={resetWatchingHudTimer}
          onClick={togglePlayPause}
        >
          {/* Нативный HTML5 видеоплеер */}
          <video
            ref={videoRef}
            className="kp-native-video"
            playsInline
            autoPlay
          />

          {/* Индикатор буферизации */}
          {isBuffering && (
            <div className="kp-buffering-indicator">
              <div className="kp-buffering-spinner" />
              <span className="kp-buffering-text">Загрузка...</span>
            </div>
          )}

          {/* OSD Уведомление */}
          {osdMessage && <div className="kp-osd-pill">{osdMessage}</div>}

          {/* ПЛАВАЮЩИЙ HUD УПРАВЛЕНИЯ */}
          <div
            className={`kp-watching-hud ${isWatchingHudVisible || isAudioDrawerOpen || isEpisodesDrawerOpen ? 'kp-watching-hud--visible' : ''}`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Верхняя панель */}
            <div className="kp-watching-top-bar">
              <button
                type="button"
                className="kp-hud-btn kp-hud-btn--back"
                onClick={() => {
                  const video = videoRef.current
                  if (video) {
                    video.pause()
                    persistProgress(video.currentTime)
                  }
                  setViewMode('overview')
                  setIsPlaying(false)
                  setTimeout(() => watchBtnRef.current?.focus(), 150)
                }}
                title="Вернуться к информации о фильме (Back)"
              >
                ← К фильму
              </button>

              <div className="kp-hud-title-wrap">
                <span className="kp-hud-title" title={movie.title}>{movie.title}</span>
                {isSeries && (
                  <button
                    type="button"
                    className="kp-hud-btn--series-badge"
                    onClick={() => {
                      setIsEpisodesDrawerOpen((prev) => !prev)
                      setIsAudioDrawerOpen(false)
                      resetWatchingHudTimer()
                    }}
                    title="Нажмите для выбора сезона или серии"
                  >
                    📺 Сезон {selectedSeason} • Серия {selectedEpisode} ▼
                  </button>
                )}
              </div>

              <div className="kp-hud-right-actions">
                {/* Озвучка */}
                {audioTracks.length > 1 && (
                  <button
                    type="button"
                    className="kp-hud-btn kp-hud-btn--audio"
                    onClick={() => {
                      setIsAudioDrawerOpen((prev) => !prev)
                      setIsEpisodesDrawerOpen(false)
                      resetWatchingHudTimer()
                    }}
                    title="Выбрать озвучку"
                  >
                    🎙 {selectedTrackName}
                  </button>
                )}

                {/* Качество */}
                {hlsLevels.length > 1 && (
                  <button
                    type="button"
                    className="kp-hud-btn"
                    onClick={() => {
                      // Циклически переключаем: auto -> каждый уровень -> auto
                      const nextLevel = currentLevel === -1 ? 0 : currentLevel + 1 >= hlsLevels.length ? -1 : currentLevel + 1
                      handleQualitySwitch(nextLevel)
                    }}
                    title="Переключить качество"
                  >
                    🌟 {currentQualityLabel}
                  </button>
                )}

                {/* Следующая серия */}
                {isSeries && (
                  <button
                    type="button"
                    className="kp-hud-btn"
                    onClick={() => {
                      const currentEpIdx = episodes.findIndex((e) => e.episodeId === selectedEpisode)
                      if (currentEpIdx >= 0 && currentEpIdx < episodes.length - 1) {
                        const nextEp = episodes[currentEpIdx + 1]
                        setSelectedEpisode(nextEp.episodeId)
                        loadStream(Number(selectedSeason), Number(nextEp.episodeId))
                        showOsd(`📺 ${nextEp.name}`)
                      } else {
                        showOsd('Это последняя серия сезона')
                      }
                    }}
                    title="Следующая серия"
                  >
                    ▶▶ Следующая
                  </button>
                )}

                <span className="kp-watching-clock">{clockTime}</span>
              </div>
            </div>

            {/* Выпадающая панель смены озвучки */}
            {isAudioDrawerOpen && (
              <div className="kp-audio-drawer" onClick={(e) => e.stopPropagation()}>
                <span className="kp-drawer-title">Выберите озвучку:</span>
                <div className="kp-drawer-chips">
                  {audioTracks.map((tr, idx) => (
                    <button
                      key={tr}
                      type="button"
                      className={`kp-drawer-chip ${selectedAudioIdx === idx ? 'kp-drawer-chip--active' : ''}`}
                      onClick={() => handleSelectAudio(idx)}
                    >
                      🎙 {tr}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Выпадающая панель выбора серии и сезона для пульта */}
            {isEpisodesDrawerOpen && isSeries && (
              <div className="kp-episodes-drawer" onClick={(e) => e.stopPropagation()}>
                <span className="kp-drawer-title">Выбор сезона и серии:</span>
                {seasons.length > 1 && (
                  <div className="kp-seasons-tabs" style={{ marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                    {seasons.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        className={`kp-season-tab ${selectedSeason === s.id ? 'kp-season-tab--active' : ''}`}
                        onClick={() => {
                          setSelectedSeason(s.id)
                          setSelectedEpisode('1')
                          loadStream(Number(s.id), 1)
                          setIsEpisodesDrawerOpen(false)
                          resetWatchingHudTimer()
                          showOsd(`📺 Переход: Сезон ${s.id} • Серия 1`)
                        }}
                      >
                        {s.name}
                      </button>
                    ))}
                  </div>
                )}
                <div className="kp-drawer-episodes-grid">
                  {episodes.map((ep) => (
                    <button
                      key={ep.episodeId}
                      type="button"
                      className={`kp-drawer-chip ${selectedEpisode === ep.episodeId ? 'kp-drawer-chip--active' : ''}`}
                      style={{ textAlign: 'center', padding: '0.65rem 0.3rem', fontSize: '0.95rem' }}
                      onClick={() => {
                        setSelectedEpisode(ep.episodeId)
                        setIsEpisodesDrawerOpen(false)
                        resetWatchingHudTimer()
                        showOsd(`📺 Сезон ${selectedSeason} • Серия ${ep.episodeId}`)
                        loadStream(Number(selectedSeason), Number(ep.episodeId))
                      }}
                    >
                      {ep.episodeId} сер.
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Нижняя панель управления с шкалой перемотки */}
            <div className="kp-watching-bottom-bar">
              {/* Полоса перемотки */}
              <div className="kp-timeline-row">
                <span className="kp-time-label kp-time-current">
                  {formatWatchTime(currentWatchTime)}
                </span>
                <div
                  className="kp-seekbar-container"
                  onClick={(e) => {
                    e.stopPropagation()
                    const rect = e.currentTarget.getBoundingClientRect()
                    const clickX = e.clientX - rect.left
                    const fraction = Math.max(0, Math.min(1, clickX / rect.width))
                    const target = Math.floor(fraction * (totalDuration || 7200))
                    handleSeekToAbsolute(target)
                  }}
                  tabIndex={0}
                  title="Нажмите для быстрой перемотки"
                >
                  <div className="kp-seekbar-rail">
                    <div
                      className="kp-seekbar-fill"
                      style={{ width: `${progressPercent}%` }}
                    />
                    <div
                      className="kp-seekbar-thumb"
                      style={{ left: `${progressPercent}%` }}
                    />
                  </div>
                </div>
                <span className="kp-time-label kp-time-total">
                  {formatWatchTime(totalDuration || 0)}
                </span>
              </div>

              {/* Ряд кнопок управления */}
              <div className="kp-controls-row">
                <div className="kp-controls-left">
                  <button
                    type="button"
                    className="kp-hud-btn kp-hud-seek-btn"
                    onClick={(e) => { e.stopPropagation(); handleSeek(-10) }}
                    title="Перемотать назад на 10 секунд (◄)"
                  >
                    ⏪ -10с
                  </button>

                  <button
                    type="button"
                    className="kp-hud-btn kp-hud-play-toggle"
                    onClick={(e) => { e.stopPropagation(); togglePlayPause() }}
                  >
                    {isPlaying ? '⏸ Пауза' : '▶ Старт'}
                  </button>

                  <button
                    type="button"
                    className="kp-hud-btn kp-hud-seek-btn"
                    onClick={(e) => { e.stopPropagation(); handleSeek(10) }}
                    title="Перемотать вперед на 10 секунд (►)"
                  >
                    ⏩ +10с
                  </button>

                  <button
                    type="button"
                    className="kp-hud-btn kp-hud-btn--subtle"
                    onClick={(e) => { e.stopPropagation(); handleSeek(-60) }}
                    title="Перемотать на 1 минуту назад"
                  >
                    -1 мин
                  </button>
                  <button
                    type="button"
                    className="kp-hud-btn kp-hud-btn--subtle"
                    onClick={(e) => { e.stopPropagation(); handleSeek(60) }}
                    title="Перемотать на 1 минуту вперед"
                  >
                    +1 мин
                  </button>

                  <span className="kp-current-track-label">
                    🎙 {selectedTrackName} • 🌟 {currentQualityLabel}
                  </span>
                </div>

                <div className="kp-controls-right">
                  <span className="kp-remote-hint">
                    Пульт: <strong>◄ / ►</strong> Перемотка 10с • <strong>OK</strong> Пауза • <strong>←</strong> Назад
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
