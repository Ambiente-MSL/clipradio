import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { motion } from 'framer-motion'
import { Radio, Globe, Plus, Edit, Trash2, Star, StarOff, Loader, MapPin, Play, Pause, CheckCircle, AlertCircle, LayoutGrid, List, CircleDot, Clock, ChevronLeft, ChevronRight, Upload } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/SupabaseAuthContext'
import apiClient from '@/lib/apiClient'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'

const extractStreamUrl = (text, extension) => {
  const content = String(text || '')
  const ext = String(extension || '').toLowerCase()

  if (ext === 'pls') {
    const fileLine = content.match(/^\s*file\d+\s*=\s*(.+)$/im)
    if (fileLine && fileLine[1]) {
      return fileLine[1].trim()
    }
  }

  if (ext === 'asx') {
    const hrefMatch = content.match(/<\s*ref\b[^>]*href\s*=\s*["']([^"']+)["']/i)
    if (hrefMatch && hrefMatch[1]) {
      return hrefMatch[1].trim()
    }
  }

  const urlMatch = content.match(/https?:\/\/[^\s"'<>]+/i)
  return urlMatch ? urlMatch[0].trim() : ''
}

const CadastroRadios = () => {
  const [radios, setRadios] = useState([])
  const [formData, setFormData] = useState({
    nome: '',
    stream_url: '',
    cidade: '',
    estado: '',
    favorita: false,
    bitrate_kbps: 128,
    output_format: 'mp3',
    audio_mode: 'stereo',
  })
  const [editingId, setEditingId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [currentRadioId, setCurrentRadioId] = useState(null)
  const [isBuffering, setIsBuffering] = useState(false)
  const [streamStatus, setStreamStatus] = useState({ state: 'idle', message: '' })
  const [viewMode, setViewMode] = useState('card')
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false)
  const [radiosPage, setRadiosPage] = useState(1)
  const [scheduledRadioIds, setScheduledRadioIds] = useState(new Set())
  const [recordPanelRadioId, setRecordPanelRadioId] = useState(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [radioToDelete, setRadioToDelete] = useState(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [startingRecording, setStartingRecording] = useState(false)
  const [recordStartTime, setRecordStartTime] = useState('')
  const [recordEndTime, setRecordEndTime] = useState('')
  const [recordDate, setRecordDate] = useState(() => {
    const today = new Date()
    const month = String(today.getMonth() + 1).padStart(2, '0')
    const day = String(today.getDate()).padStart(2, '0')
    return `${today.getFullYear()}-${month}-${day}`
  })
  const [recordRecurrence, setRecordRecurrence] = useState('once')
  const [activeRecordingId, setActiveRecordingId] = useState(null)
  const audioRef = useRef(null)
  const validationAudioRef = useRef(null)
  const streamFileInputRef = useRef(null)
  const { toast } = useToast()
  const { user } = useAuth()
  const ITEMS_PER_PAGE = 10
  const filteredRadios = useMemo(
    () => (showFavoritesOnly ? radios.filter((radio) => radio.favorita) : radios),
    [radios, showFavoritesOnly],
  )
  const totalPages = useMemo(() => Math.max(1, Math.ceil(filteredRadios.length / ITEMS_PER_PAGE)), [filteredRadios.length])
  const paginatedRadios = useMemo(() => {
    const startIndex = (radiosPage - 1) * ITEMS_PER_PAGE
    return filteredRadios.slice(startIndex, startIndex + ITEMS_PER_PAGE)
  }, [filteredRadios, radiosPage])
  const canPrevPage = radiosPage > 1
  const canNextPage = radiosPage < totalPages

  useEffect(() => {
    setRadiosPage((prev) => Math.min(prev, totalPages))
  }, [totalPages])

  const resetForm = useCallback(() => {
    setFormData({ nome: '', stream_url: '', cidade: '', estado: '', favorita: false, bitrate_kbps: 128, output_format: 'mp3', audio_mode: 'stereo' })
    setEditingId(null)
    setStreamStatus({ state: 'idle', message: '' })
  }, [])

  const getPlaybackErrorMessage = (err) => {
    const name = String(err?.name || '').toLowerCase()
    const message = String(err?.message || '').toLowerCase()

    if (name === 'notallowederror') {
      return 'O navegador bloqueou a reprodução automática. Clique em Reproduzir novamente.'
    }
    if (name === 'notsupportederror' || message.includes('supported source') || message.includes('not supported')) {
      return 'Este stream não é compatível com o navegador. Confira o formato ou use outra URL.'
    }
    if (name === 'aborterror' || message.includes('interrupted by a call to pause') || message.includes('interrupted')) {
      return 'A reprodução foi interrompida. Tente novamente.'
    }
    if (message.includes('failed to fetch') || message.includes('network') || message.includes('404') || message.includes('not found')) {
      return 'Não foi possível conectar ao stream. Verifique a URL e tente novamente.'
    }
    return 'Não foi possível reproduzir este stream agora. Verifique a URL ou tente novamente.'
  }

  const fetchRadios = useCallback(async () => {
    setLoading(true)
    try {
      const [radiosData, agData] = await Promise.all([
        apiClient.getRadios(),
        apiClient.getAgendamentos().catch(() => []),
      ])
      setRadios(radiosData || [])
      const agSet = new Set((agData || []).map((ag) => ag.radio_id))
      setScheduledRadioIds(agSet)
    } catch (error) {
      toast({ title: 'Erro ao buscar radios', description: error.message, variant: 'destructive' })
    }
    setLoading(false)
  }, [toast])

  useEffect(() => {
    fetchRadios()
  }, [fetchRadios])

  useEffect(() => {
    const url = formData.stream_url.trim()
    if (!url) {
      setStreamStatus({ state: 'idle', message: '' })
      return
    }

    let cancelled = false
    const audio = new Audio()
    validationAudioRef.current = audio
    let timeoutId

    function cleanup() {
      audio.pause()
      audio.src = ''
      audio.removeEventListener('canplay', handleCanPlay)
      audio.removeEventListener('loadedmetadata', handleCanPlay)
      audio.removeEventListener('error', handleError)
      if (timeoutId) clearTimeout(timeoutId)
    }

    function handleCanPlay() {
      if (cancelled) return
      setStreamStatus({ state: 'valid', message: 'Stream válido para agendamentos e gravações.' })
      cleanup()
    }

    function handleError() {
      if (cancelled) return
      setStreamStatus({ state: 'error', message: 'Não foi possível validar este stream.' })
      cleanup()
    }

    setStreamStatus({ state: 'loading', message: 'Validando stream...' })

    timeoutId = setTimeout(() => {
      if (cancelled) return
      setStreamStatus({ state: 'error', message: 'Tempo esgotado ao validar o stream.' })
      cleanup()
    }, 8000)

    audio.addEventListener('canplay', handleCanPlay)
    audio.addEventListener('loadedmetadata', handleCanPlay)
    audio.addEventListener('error', handleError)
    audio.src = url
    audio.load()

    return () => {
      cancelled = true
      cleanup()
    }
  }, [formData.stream_url])

  const handleStreamFilePick = () => {
    if (streamFileInputRef.current) {
      streamFileInputRef.current.click()
    }
  }

  const readFileText = (file) => {
    if (file?.text) {
      return file.text()
    }
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result || '')
      reader.onerror = () => reject(reader.error || new Error('Falha ao ler arquivo'))
      reader.readAsText(file)
    })
  }

  const handleStreamFileChange = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    const extension = (file.name.split('.').pop() || '').toLowerCase()
    if (!['pls', 'asx'].includes(extension)) {
      toast({ title: 'Arquivo inválido', description: 'Envie um arquivo .pls ou .asx.', variant: 'destructive' })
      return
    }

    try {
      const content = await readFileText(file)
      const extracted = extractStreamUrl(content, extension)
      if (!extracted) {
        setStreamStatus({ state: 'error', message: 'Não foi possível extrair a URL do arquivo.' })
        toast({ title: 'URL não encontrada', description: 'O arquivo não contém uma URL de stream válida.', variant: 'destructive' })
        return
      }
      setFormData((prev) => ({ ...prev, stream_url: extracted }))
      toast({ title: 'Arquivo carregado', description: 'URL do stream preenchida automaticamente.' })
    } catch (error) {
      toast({ title: 'Erro ao ler arquivo', description: error.message, variant: 'destructive' })
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!formData.nome || !formData.stream_url || !formData.cidade || !formData.estado) {
      toast({ title: 'Erro', description: 'Todos os campos são obrigatórios', variant: 'destructive' })
      return
    }

    if (streamStatus.state === 'error') {
      toast({ title: 'URL inválida', description: 'Ajuste a URL do stream antes de salvar.', variant: 'destructive' })
      return
    }

    setSaving(true)
    try {
      if (editingId) {
        await apiClient.updateRadio(editingId, formData)
        toast({ title: 'Sucesso!', description: 'Rádio atualizada com sucesso' })
      } else {
        await apiClient.createRadio(formData)
        toast({ title: 'Sucesso!', description: 'Rádio cadastrada com sucesso' })
      }
      resetForm()
      fetchRadios()
    } catch (error) {
      toast({ title: 'Erro ao salvar rádio', description: error.message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = (radio) => {
    setEditingId(radio.id)
    setFormData({
      nome: radio.nome,
      stream_url: radio.stream_url,
      cidade: radio.cidade || '',
      estado: radio.estado || '',
      favorita: radio.favorita || false,
      bitrate_kbps: radio.bitrate_kbps || 128,
      output_format: radio.output_format || 'mp3',
      audio_mode: radio.audio_mode || 'stereo',
    })
  }

  const handleDelete = async (id) => {
    try {
      await apiClient.deleteRadio(id)
      toast({ title: 'Rádio removida', description: 'A rádio foi removida com sucesso' })
      fetchRadios()
    } catch (error) {
      toast({ title: 'Erro ao remover rádio', description: error.message, variant: 'destructive' })
    }
  }

  const openDeleteDialog = (radio) => {
    setRadioToDelete(radio)
    setDeleteDialogOpen(true)
  }

  const handleDeleteDialogChange = (open) => {
    setDeleteDialogOpen(open)
    if (!open) {
      setRadioToDelete(null)
    }
  }

  const confirmDelete = async () => {
    if (!radioToDelete) return
    setIsDeleting(true)
    await handleDelete(radioToDelete.id)
    setIsDeleting(false)
    handleDeleteDialogChange(false)
  }

  const toggleFavorite = async (radio) => {
    try {
      const updated = { ...radio, favorita: !radio.favorita }
      await apiClient.updateRadio(radio.id, { favorita: updated.favorita })
      setRadios((prev) => prev.map((r) => (r.id === radio.id ? updated : r)))
      toast({
        title: updated.favorita ? 'Adicionada aos favoritos' : 'Removida dos favoritos',
        description: `${radio.nome} foi ${updated.favorita ? 'marcada como favorita' : 'desmarcada'}.`,
      })
    } catch (error) {
      toast({ title: 'Erro ao favoritar', description: error.message, variant: 'destructive' })
    }
  }

  useEffect(() => {
    audioRef.current = new Audio()
    const audio = audioRef.current

    const handlePlay = () => setIsBuffering(false)
    const handleWaiting = () => setIsBuffering(true)
    const handleError = () => {
      setIsBuffering(false)
      toast({
        title: 'Não foi possível reproduzir',
        description: 'Não foi possível carregar o stream da rádio. Verifique a URL ou tente novamente.',
        variant: 'destructive',
      })
      setCurrentRadioId(null)
    }

    audio.addEventListener('play', handlePlay)
    audio.addEventListener('waiting', handleWaiting)
    audio.addEventListener('canplay', handlePlay)
    audio.addEventListener('error', handleError)

    return () => {
      audio.pause()
      audio.removeEventListener('play', handlePlay)
      audio.removeEventListener('waiting', handleWaiting)
      audio.removeEventListener('canplay', handlePlay)
      audio.removeEventListener('error', handleError)
    }
  }, [toast])

  const handlePlayPause = useCallback(
    async (radio) => {
      const audio = audioRef.current
      if (!audio) return

      if (currentRadioId === radio.id && !audio.paused) {
        audio.pause()
        setCurrentRadioId(null)
        setIsBuffering(false)
        return
      }

      try {
        setIsBuffering(true)
        audio.pause()
        audio.src = radio.stream_url
        audio.load()
        await audio.play()
        setCurrentRadioId(radio.id)
      } catch (err) {
        setIsBuffering(false)
        toast({
          title: 'Não foi possível reproduzir',
          description: getPlaybackErrorMessage(err),
          variant: 'destructive',
        })
        setCurrentRadioId(null)
      }
    },
    [currentRadioId, toast]
  )

  const isPlaying = (id) => currentRadioId === id && audioRef.current && !audioRef.current.paused

  const openRecordModal = (radioId) => {
    setRecordPanelRadioId(radioId)
    setRecordStartTime('')
    setRecordEndTime('')
    const today = new Date()
    const month = String(today.getMonth() + 1).padStart(2, '0')
    const day = String(today.getDate()).padStart(2, '0')
    setRecordDate(`${today.getFullYear()}-${month}-${day}`)
    setRecordRecurrence('once')
  }

  const closeRecordModal = () => {
    setRecordPanelRadioId(null)
  }

  const handleStartRecording = async (radio) => {
    if (!radio?.id) return
    const computeDurationMinutes = () => {
      if (recordStartTime && recordEndTime) {
        const [sh, sm] = recordStartTime.split(':').map(Number)
        const [eh, em] = recordEndTime.split(':').map(Number)
        const start = sh * 60 + sm
        const end = eh * 60 + em
        const diff = end - start
        return diff > 0 ? diff : null
      }
      return null
    }

    const plannedDuration = computeDurationMinutes()
    if (!plannedDuration || plannedDuration <= 0) {
      toast({ title: 'Horário inválido', description: 'Defina hora de início e fim válidas.', variant: 'destructive' })
      return
    }

    setStartingRecording(true)
    try {
      const gravacao = await apiClient.createGravacao({
        radio_id: radio.id,
        duracao_minutos: plannedDuration,
        status: 'iniciando',
        tipo: 'manual',
      })

      await apiClient.startRecording(gravacao.id)
      toast({
        title: 'Gravacao iniciada',
        description: `${radio.nome} por ${plannedDuration} minutos.`,
      })
      window.dispatchEvent(new CustomEvent('recording-started', {
        detail: {
          id: gravacao.id,
          radioNome: radio.nome,
          duracao: plannedDuration,
          startedAt: new Date().toISOString(),
          status: 'iniciando',
        },
      }))
      setActiveRecordingId(radio.id)
      setTimeout(() => {
        setActiveRecordingId((current) => current === radio.id ? null : current)
      }, plannedDuration * 60 * 1000 + 60000)
      closeRecordModal()
    } catch (error) {
      toast({
        title: 'Erro ao iniciar',
        description: error.message,
        variant: 'destructive',
      })
    } finally {
      setStartingRecording(false)
    }
  }

  const renderStreamStatusIcon = () => {
    if (streamStatus.state === 'loading') {
      return <Loader className="w-4 h-4 text-cyan-400 animate-spin" />
    }
    if (streamStatus.state === 'valid') {
      return <CheckCircle className="w-4 h-4 text-emerald-400" />
    }
    if (streamStatus.state === 'error') {
      return <AlertCircle className="w-4 h-4 text-red-400" />
    }
    return null
  }

  return (
    <div className="min-h-screen p-4 md:p-6 pt-32">
      <div className="max-w-7xl mx-auto">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold gradient-text mb-2">Gerenciador de rádios</h1>
          <p className="text-slate-400 text-lg">Adicione, edite e organize suas estações de rádio.</p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="lg:col-span-1">
            <Card className="bg-slate-800/40 border-slate-700/60 lg:sticky lg:top-32">
              <CardHeader>
                <CardTitle className="flex items-center text-white">
                  <Plus className="w-6 h-6 mr-3 text-cyan-400" />
                  {editingId ? 'Editar rádio' : 'Nova rádio'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">Nome da rádio</label>
                    <Input
                      value={formData.nome}
                      onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                      placeholder="Ex: Rádio Rock"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">URL do Stream</label>
                    <div className="relative">
                      <Input
                        className="pl-10 pr-10"
                        value={formData.stream_url}
                        onChange={(e) => setFormData({ ...formData, stream_url: e.target.value })}
                        placeholder="https://stream.minharadio.com/stream"
                      />
                      <button
                        type="button"
                        onClick={handleStreamFilePick}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                        title="Enviar arquivo .pls ou .asx"
                        aria-label="Enviar arquivo .pls ou .asx"
                      >
                        <Upload className="w-4 h-4" />
                      </button>
                      <input
                        ref={streamFileInputRef}
                        type="file"
                        accept=".pls,.asx"
                        className="hidden"
                        onChange={handleStreamFileChange}
                      />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        {renderStreamStatusIcon()}
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">Envie um arquivo .pls ou .asx para preencher a URL automaticamente.</p>
                    {streamStatus.state === 'error' && (
                      <p className="text-xs text-red-400 mt-1">{streamStatus.message}</p>
                    )}
                    {streamStatus.state === 'valid' && (
                      <p className="text-xs text-emerald-400 mt-1">
                        Stream reconhecido e pronto para agendamentos ou gravações.
                      </p>
                    )}
                    {streamStatus.state === 'loading' && (
                      <p className="text-xs text-slate-400 mt-1">Validando stream...</p>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-slate-400 mb-1">Cidade</label>
                      <div className="relative">
                        <Input
                          value={formData.cidade}
                          onChange={(e) => setFormData({ ...formData, cidade: e.target.value })}
                          placeholder="Ex: Fortaleza"
                        />
                        <Globe className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm text-slate-400 mb-1">Estado (UF)</label>
                      <div className="relative">
                        <Input
                          maxLength={2}
                          value={formData.estado}
                          onChange={(e) => setFormData({ ...formData, estado: e.target.value.toUpperCase() })}
                          placeholder="Ex: CE"
                        />
                        <MapPin className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="flex flex-col">
                      <label className="block text-sm text-slate-400 mb-1 h-5">Bitrate</label>
                      <select
                        value={formData.bitrate_kbps}
                        onChange={(e) => setFormData({ ...formData, bitrate_kbps: Number(e.target.value) })}
                        className="w-full h-[42px] bg-slate-900/60 border border-slate-700 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                      >
                        <option value={128}>128 kbps</option>
                        <option value={96}>96 kbps</option>
                      </select>
                    </div>
                    <div className="flex flex-col">
                      <label className="block text-sm text-slate-400 mb-1 h-5">Formato</label>
                      <select
                        value={formData.output_format}
                        onChange={(e) => setFormData({ ...formData, output_format: e.target.value })}
                        className="w-full h-[42px] bg-slate-900/60 border border-slate-700 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                      >
                        <option value="mp3">MP3</option>
                        <option value="opus">Opus</option>
                      </select>
                    </div>
                    <div className="flex flex-col">
                      <label className="block text-sm text-slate-400 mb-1 h-5">Qualidade</label>
                      <select
                        value={formData.audio_mode}
                        onChange={(e) => setFormData({ ...formData, audio_mode: e.target.value })}
                        className="w-full h-[42px] bg-slate-900/60 border border-slate-700 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                      >
                        <option value="stereo">Estéreo</option>
                        <option value="mono">Mono</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center justify-between py-2">
                    <span className="text-sm text-slate-300">Marcar como favorita</span>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setFormData((prev) => ({ ...prev, favorita: !prev.favorita }))}
                      className="text-yellow-400"
                    >
                      {formData.favorita ? <Star className="w-5 h-5" /> : <StarOff className="w-5 h-5" />}
                    </Button>
                  </div>

                  <div className="flex gap-3">
                    <Button type="submit" className="flex-1" disabled={saving}>
                      {saving ? 'Salvando...' : editingId ? 'Salvar alterações' : 'Adicionar rádio'}
                    </Button>
                    {editingId && (
                      <Button type="button" variant="outline" onClick={resetForm}>
                        Cancelar
                      </Button>
                    )}
                  </div>
                </form>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="lg:col-span-2">
            <Card className="bg-slate-800/40 border-slate-700/60">
              <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <CardTitle className="flex items-center text-white">
                  <Radio className="w-6 h-6 mr-3 text-cyan-400" />
                  Rádios cadastradas
                </CardTitle>
                <div className="flex items-center gap-3">
                  <Button
                    size="sm"
                    variant={showFavoritesOnly ? 'default' : 'ghost'}
                    onClick={() => setShowFavoritesOnly((prev) => !prev)}
                    aria-pressed={showFavoritesOnly}
                    className={`h-8 px-3 ${showFavoritesOnly ? 'bg-yellow-500 hover:bg-yellow-600 text-slate-900' : 'text-slate-300'}`}
                  >
                    {showFavoritesOnly ? <Star className="w-4 h-4 mr-2" /> : <StarOff className="w-4 h-4 mr-2" />}
                    Favoritas
                  </Button>
                  <span className="text-sm text-slate-400">
                    Total: {showFavoritesOnly ? `${filteredRadios.length} de ${radios.length}` : radios.length}
                  </span>
                  <div className="flex gap-1 p-1 bg-slate-900/60 rounded-md border border-slate-700">
                    <Button
                      size="sm"
                      variant={viewMode === 'card' ? 'default' : 'ghost'}
                      onClick={() => setViewMode('card')}
                      className={`px-3 h-8 ${viewMode === 'card' ? 'bg-cyan-500 hover:bg-cyan-600' : ''}`}
                    >
                      <LayoutGrid className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant={viewMode === 'list' ? 'default' : 'ghost'}
                      onClick={() => setViewMode('list')}
                      className={`px-3 h-8 ${viewMode === 'list' ? 'bg-cyan-500 hover:bg-cyan-600' : ''}`}
                    >
                      <List className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                  {loading ? (
                    <div className="flex justify-center py-12">
                      <Loader className="w-10 h-10 animate-spin text-cyan-400" />
                    </div>
                  ) : filteredRadios.length === 0 ? (
                    <div className="text-center py-12 text-slate-400">
                      {showFavoritesOnly ? 'Nenhuma rádio favorita encontrada.' : 'Nenhuma radio cadastrada ainda.'}
                    </div>
                  ) : viewMode === 'card' ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {paginatedRadios.map((radio, index) => {
                        const row = Math.floor(index / 2)
                        const col = index % 2
                        const isLight = (row + col) % 2 === 0
                        return (
                      <div
                        key={radio.id}
                        className={`group relative ${isLight ? 'bg-gradient-to-br from-slate-800/70 to-slate-800/50' : 'bg-gradient-to-br from-slate-900/60 to-slate-900/40'} border ${isLight ? 'border-slate-600/60' : 'border-slate-700/60'} rounded-xl overflow-hidden hover:border-cyan-500/30 transition-all duration-300 hover:shadow-lg hover:shadow-cyan-500/5`}
                      >
                        {/* Header com nome e favorito */}
                        <div className="p-4 pb-3 border-b border-slate-800/50">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <h3 className="text-base font-bold text-white truncate">{radio.nome}</h3>
                                {activeRecordingId === radio.id && (
                                  <span className="text-[10px] font-bold text-red-300 uppercase tracking-wide animate-pulse">
                                    Gravando
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-slate-500 truncate font-mono">{radio.stream_url}</p>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => toggleFavorite(radio)}
                              className="h-8 w-8 flex-shrink-0 hover:bg-yellow-500/10 transition-colors"
                              aria-pressed={radio.favorita}
                            >
                              <motion.span
                                initial={false}
                                animate={
                                  radio.favorita
                                    ? { scale: [1, 1.25, 1], rotate: [0, 12, 0] }
                                    : { scale: [1, 0.9, 1], rotate: [0, -10, 0] }
                                }
                                transition={{ duration: 0.35, ease: 'easeOut' }}
                                className="inline-flex"
                              >
                                {radio.favorita ? (
                                  <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                                ) : (
                                  <StarOff className="w-4 h-4 text-slate-500 group-hover:text-yellow-400/50 transition-colors" />
                                )}
                              </motion.span>
                            </Button>
                          </div>
                        </div>

                        {/* Informações e badges */}
                        <div className="px-4 py-3 space-y-2">
                          <div className="flex items-center flex-wrap gap-2">
                            <div className="flex items-center gap-1.5 text-xs text-slate-400">
                              <Globe className="w-3.5 h-3.5" />
                              <span>{radio.cidade || '--'}</span>
                            </div>
                            <div className="w-px h-3 bg-slate-700" />
                            <div className="flex items-center gap-1.5 text-xs text-slate-400">
                              <MapPin className="w-3.5 h-3.5" />
                              <span>{radio.estado || '--'}</span>
                            </div>
                          </div>

                          <div className="flex items-center flex-wrap gap-1.5">
                            <span className="px-2 py-0.5 rounded-md bg-slate-800/60 border border-slate-700/50 text-[11px] font-medium text-slate-300">
                              {radio.bitrate_kbps || 128} kbps
                            </span>
                            <span className="px-2 py-0.5 rounded-md bg-slate-800/60 border border-slate-700/50 text-[11px] font-medium text-slate-300">
                              {(radio.output_format || 'mp3').toUpperCase()}
                            </span>
                            <span className="px-2 py-0.5 rounded-md bg-slate-800/60 border border-slate-700/50 text-[11px] font-medium text-slate-300">
                              {radio.audio_mode === 'mono' ? 'Mono' : 'Estéreo'}
                            </span>
                            {scheduledRadioIds.has(radio.id) && (
                              <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                                <Clock className="w-3 h-3" />
                                <span className="text-[11px] font-semibold">Agendado</span>
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Botões de ação */}
                        <div className="px-4 pb-4 pt-2">
                          <div className="flex items-center gap-2">
                            {/* Botão Play/Pause - destaque */}
                            <Button
                              size="sm"
                              onClick={() => handlePlayPause(radio)}
                              className="flex-1 h-9 bg-cyan-500 hover:bg-cyan-600 text-white font-medium shadow-sm"
                            >
                              {isPlaying(radio.id) ? (
                                <>
                                  <Pause className="w-3.5 h-3.5 mr-1.5" />
                                  Pausar
                                </>
                              ) : (
                                <>
                                  <Play className="w-3.5 h-3.5 mr-1.5" />
                                  {isBuffering && currentRadioId === radio.id ? 'Carregando...' : 'Ouvir'}
                                </>
                              )}
                            </Button>

                            {/* Botão Gravar */}
                            {(() => {
                              const isRecording = activeRecordingId === radio.id
                              const baseClasses = 'flex-1 h-9 font-medium transition-all duration-300'
                              const activeClasses = 'bg-red-500 hover:bg-red-600 text-white border-red-500 shadow-lg shadow-red-500/30'
                              const defaultClasses = 'bg-red-500 hover:bg-red-600 text-black border-red-500'
                              return (
                                <Button
                                  size="sm"
                                  variant={isRecording ? 'default' : 'default'}
                                  onClick={() => openRecordModal(radio.id)}
                                  className={`${baseClasses} ${isRecording ? activeClasses : defaultClasses}`}
                                  disabled={isRecording}
                                >
                                  <CircleDot className={`w-3.5 h-3.5 mr-1.5 ${isRecording ? 'animate-pulse' : ''}`} />
                                  {isRecording ? 'Gravando' : 'Gravar'}
                                </Button>
                              )
                            })()}
                          </div>

                          {/* Botões secundários */}
                          <div className="flex items-center gap-2 mt-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleEdit(radio)}
                              className="flex-1 h-8 text-xs text-slate-400 hover:text-white hover:bg-slate-800/60"
                            >
                              <Edit className="w-3 h-3 mr-1" />
                              Editar
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => openDeleteDialog(radio)}
                              className="flex-1 h-8 text-xs text-slate-400 hover:text-red-400 hover:bg-red-500/10"
                            >
                              <Trash2 className="w-3 h-3 mr-1" />
                              Excluir
                            </Button>
                          </div>
                        </div>
                      </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {paginatedRadios.map((radio, index) => (
                      <div
                        key={radio.id}
                        className={`p-3 ${index % 2 === 0 ? 'bg-slate-800/60' : 'bg-slate-900/40'} border ${index % 2 === 0 ? 'border-slate-700' : 'border-slate-800'} rounded-lg flex items-center gap-3 hover:border-cyan-500/30 transition-all duration-200`}
                      >
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => toggleFavorite(radio)}
                          className="text-yellow-400 flex-shrink-0"
                          aria-pressed={radio.favorita}
                        >
                          <motion.span
                            initial={false}
                            animate={
                              radio.favorita
                                ? { scale: [1, 1.25, 1], rotate: [0, 12, 0] }
                                : { scale: [1, 0.9, 1], rotate: [0, -10, 0] }
                            }
                            transition={{ duration: 0.35, ease: 'easeOut' }}
                            className="inline-flex"
                          >
                            {radio.favorita ? <Star className="w-5 h-5" /> : <StarOff className="w-5 h-5" />}
                          </motion.span>
                        </Button>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-base font-semibold text-white truncate">{radio.nome}</h3>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 mt-1">
                            <span className="flex items-center gap-1">
                              <Globe className="w-3 h-3" />
                              {radio.cidade || '--'}
                            </span>
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              {radio.estado || '--'}
                            </span>
                            {scheduledRadioIds.has(radio.id) && (
                              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-400/40 text-emerald-300 text-[11px] font-semibold">
                                <Clock className="w-3 h-3" /> Agendado
                              </span>
                            )}
                            <span className="px-2 py-0.5 rounded-full bg-slate-800/80 border border-slate-700">
                              {radio.bitrate_kbps || 128} kbps
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-slate-800/80 border border-slate-700">
                              {(radio.output_format || 'mp3').toUpperCase()}
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-slate-800/80 border border-slate-700">
                              {radio.audio_mode === 'mono' ? 'Mono' : 'Estéreo'}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {(() => {
                            const isRecording = activeRecordingId === radio.id
                            const baseClasses = 'h-8 px-3 text-xs font-medium transition-all duration-300'
                            const activeClasses = 'bg-red-500 hover:bg-red-600 text-white border-red-500 shadow-lg shadow-red-500/30'
                            const defaultClasses = 'bg-red-500 hover:bg-red-600 text-black border-red-500'
                            return (
                              <Button
                                size="sm"
                                variant={isRecording ? 'default' : 'default'}
                                onClick={() => openRecordModal(radio.id)}
                                className={`${baseClasses} ${isRecording ? activeClasses : defaultClasses}`}
                                disabled={isRecording}
                              >
                                <CircleDot className={`w-3 h-3 mr-1 ${isRecording ? 'animate-pulse' : ''}`} />
                                {isRecording ? 'Gravando' : 'Gravar'}
                              </Button>
                            )
                          })()}
                          <Button size="sm" variant="outline" onClick={() => handleEdit(radio)}>
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive"
                            onClick={() => openDeleteDialog(radio)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handlePlayPause(radio)}
                            className="flex items-center gap-1"
                          >
                            {isPlaying(radio.id) ? (
                              <>
                                <Pause className="w-4 h-4" />
                                <span className="hidden sm:inline">Pausar</span>
                              </>
                            ) : (
                              <>
                                <Play className="w-4 h-4" />
                                <span className="hidden sm:inline">
                                  {isBuffering && currentRadioId === radio.id ? 'Carregando...' : 'Ouvir'}
                                </span>
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                      ))}
                    </div>
                  )}
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Página {radiosPage} de {totalPages}</span>
                  <div className="flex items-center gap-2">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => setRadiosPage((prev) => Math.max(prev - 1, 1))}
                      disabled={!canPrevPage || loading || radios.length === 0}
                      title="Página anterior"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => setRadiosPage((prev) => Math.min(prev + 1, totalPages))}
                      disabled={!canNextPage || loading || radios.length === 0}
                      title="Próxima página"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        <AlertDialog open={deleteDialogOpen} onOpenChange={handleDeleteDialogChange}>
          <AlertDialogContent className="bg-slate-900 border-slate-700 text-white">
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir radio?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta acao nao pode ser desfeita. {radioToDelete?.nome ? `A radio "${radioToDelete.nome}" sera removida.` : 'Esta radio sera removida.'}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={(event) => {
                  event.preventDefault()
                  confirmDelete()
                }}
                disabled={isDeleting || !radioToDelete}
              >
                {isDeleting ? 'Excluindo...' : 'Sim, excluir'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Modal de Gravação */}
        <Dialog open={recordPanelRadioId !== null} onOpenChange={(open) => !open && closeRecordModal()}>
          <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-md">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold text-white flex items-center gap-2">
                <CircleDot className="w-5 h-5 text-red-500" />
                Configurar Gravação
              </DialogTitle>
              <DialogDescription className="text-slate-400">
                {recordPanelRadioId && radios.find(r => r.id === recordPanelRadioId)?.nome}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-semibold text-slate-300">Hora de Início</label>
                  <input
                    type="time"
                    value={recordStartTime}
                    onChange={(e) => setRecordStartTime(e.target.value)}
                    className="bg-slate-800/80 border border-slate-700 rounded-md px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-semibold text-slate-300">Hora de Fim</label>
                  <input
                    type="time"
                    value={recordEndTime}
                    onChange={(e) => setRecordEndTime(e.target.value)}
                    className="bg-slate-800/80 border border-slate-700 rounded-md px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-slate-300">Data da Gravação</label>
                <input
                  type="date"
                  value={recordDate}
                  onChange={(e) => setRecordDate(e.target.value)}
                  className="bg-slate-800/80 border border-slate-700 rounded-md px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-slate-300">Recorrência</label>
                <select
                  value={recordRecurrence}
                  onChange={(e) => setRecordRecurrence(e.target.value)}
                  className="bg-slate-800/80 border border-slate-700 rounded-md px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                >
                  <option value="once">Gravação Única</option>
                  <option value="daily">Diária</option>
                  <option value="weekly">Semanal</option>
                </select>
              </div>

              <div className="pt-4 flex gap-3">
                <Button
                  variant="outline"
                  onClick={closeRecordModal}
                  className="flex-1 border-slate-700 hover:bg-slate-800 text-slate-300"
                  disabled={startingRecording}
                >
                  Cancelar
                </Button>
                <Button
                  disabled={startingRecording}
                  onClick={() => {
                    const radio = radios.find(r => r.id === recordPanelRadioId)
                    if (radio) handleStartRecording(radio)
                  }}
                  className="flex-1 bg-red-500 hover:bg-red-600 text-white font-semibold shadow-lg shadow-red-500/20"
                >
                  {startingRecording ? (
                    <>
                      <Loader className="w-4 h-4 mr-2 animate-spin" />
                      Iniciando...
                    </>
                  ) : (
                    <>
                      <CircleDot className="w-4 h-4 mr-2" />
                      Iniciar gravação
                    </>
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}

export default CadastroRadios
