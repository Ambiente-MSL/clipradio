import React, { useState, useEffect, useCallback, useRef } from 'react'
import { motion } from 'framer-motion'
import { Radio, Globe, Plus, Edit, Trash2, Star, StarOff, Loader, MapPin, Play, Pause, CheckCircle, AlertCircle, LayoutGrid, List } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'
import { Button } from '@/components/ui/button'
import apiClient from '@/lib/apiClient'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

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
  })
  const [editingId, setEditingId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [currentRadioId, setCurrentRadioId] = useState(null)
  const [isBuffering, setIsBuffering] = useState(false)
  const [streamStatus, setStreamStatus] = useState({ state: 'idle', message: '' })
  const [viewMode, setViewMode] = useState('card')
  const audioRef = useRef(null)
  const validationAudioRef = useRef(null)
  const { toast } = useToast()

  const resetForm = useCallback(() => {
    setFormData({ nome: '', stream_url: '', cidade: '', estado: '', favorita: false, bitrate_kbps: 128, output_format: 'mp3' })
    setEditingId(null)
    setStreamStatus({ state: 'idle', message: '' })
  }, [])

  const fetchRadios = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiClient.getRadios()
      setRadios(data || [])
    } catch (error) {
      toast({ title: 'Erro ao buscar rádios', description: error.message, variant: 'destructive' })
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
        title: 'Erro ao reproduzir',
        description: 'Não foi possível tocar o stream da rádio.',
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
          title: 'Erro ao reproduzir',
          description: err?.message || 'Verifique se a URL do stream está acessível.',
          variant: 'destructive',
        })
        setCurrentRadioId(null)
      }
    },
    [currentRadioId, toast]
  )

  const isPlaying = (id) => currentRadioId === id && audioRef.current && !audioRef.current.paused

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
    <div className="min-h-screen p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold gradient-text mb-2">Gerenciador de Rádios</h1>
          <p className="text-slate-400 text-lg">Adicione, edite e organize suas estações de rádio.</p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="lg:col-span-1">
            <Card className="bg-slate-800/40 border-slate-700/60">
              <CardHeader>
                <CardTitle className="flex items-center text-white">
                  <Plus className="w-6 h-6 mr-3 text-cyan-400" />
                  {editingId ? 'Editar Rádio' : 'Nova Rádio'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">Nome da Rádio</label>
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
                        className="pr-10"
                        value={formData.stream_url}
                        onChange={(e) => setFormData({ ...formData, stream_url: e.target.value })}
                        placeholder="https://stream.minharadio.com/stream"
                      />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        {renderStreamStatusIcon()}
                      </div>
                    </div>
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
                          placeholder="São Paulo"
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
                          placeholder="SP"
                        />
                        <MapPin className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-slate-400 mb-1">Bitrate da gravação</label>
                      <select
                        value={formData.bitrate_kbps}
                        onChange={(e) => setFormData({ ...formData, bitrate_kbps: Number(e.target.value) })}
                        className="w-full bg-slate-900/60 border border-slate-700 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                      >
                        <option value={128}>128 kbps</option>
                        <option value={96}>96 kbps</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm text-slate-400 mb-1">Formato do arquivo</label>
                      <select
                        value={formData.output_format}
                        onChange={(e) => setFormData({ ...formData, output_format: e.target.value })}
                        className="w-full bg-slate-900/60 border border-slate-700 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                      >
                        <option value="mp3">MP3</option>
                        <option value="flac">FLAC</option>
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
                      {saving ? 'Salvando...' : editingId ? 'Salvar alterações' : 'Adicionar Rádio'}
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
                  Rádios Cadastradas
                </CardTitle>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-slate-400">Total: {radios.length}</span>
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
              <CardContent>
                {loading ? (
                  <div className="flex justify-center py-12">
                    <Loader className="w-10 h-10 animate-spin text-cyan-400" />
                  </div>
                ) : radios.length === 0 ? (
                  <div className="text-center py-12 text-slate-400">Nenhuma rádio cadastrada ainda.</div>
                ) : viewMode === 'card' ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {radios.map((radio) => (
                      <div
                        key={radio.id}
                        className="p-4 bg-slate-900/40 border border-slate-800 rounded-lg flex flex-col gap-3"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="text-lg font-semibold text-white">{radio.nome}</h3>
                            <p className="text-sm text-slate-400 break-all">{radio.stream_url}</p>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => toggleFavorite(radio)}
                            className="text-yellow-400"
                          >
                            {radio.favorita ? <Star className="w-5 h-5" /> : <StarOff className="w-5 h-5" />}
                          </Button>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-slate-400">
                          <span className="flex items-center gap-1">
                            <Globe className="w-4 h-4" />
                            {radio.cidade || '--'}
                          </span>
                          <span className="flex items-center gap-1">
                            <MapPin className="w-4 h-4" />
                            {radio.estado || '--'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-300">
                          <span className="px-2 py-1 rounded-full bg-slate-800/80 border border-slate-700">
                            {radio.bitrate_kbps || 128} kbps
                          </span>
                          <span className="px-2 py-1 rounded-full bg-slate-800/80 border border-slate-700">
                            {(radio.output_format || 'mp3').toUpperCase()}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2 items-center">
                          <Button size="sm" variant="outline" onClick={() => handleEdit(radio)}>
                            <Edit className="w-4 h-4 mr-2" /> Editar
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive"
                            onClick={() => handleDelete(radio.id)}
                          >
                            <Trash2 className="w-4 h-4 mr-2" /> Excluir
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handlePlayPause(radio)}
                            className="ml-auto flex items-center gap-2"
                          >
                            {isPlaying(radio.id) ? (
                              <>
                                <Pause className="w-4 h-4" /> Pausar
                              </>
                            ) : (
                              <>
                                <Play className="w-4 h-4" />{' '}
                                {isBuffering && currentRadioId === radio.id ? 'Carregando...' : 'Ouvir'}
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {radios.map((radio) => (
                      <div
                        key={radio.id}
                        className="p-3 bg-slate-900/40 border border-slate-800 rounded-lg flex items-center gap-3"
                      >
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => toggleFavorite(radio)}
                          className="text-yellow-400 flex-shrink-0"
                        >
                          {radio.favorita ? <Star className="w-5 h-5" /> : <StarOff className="w-5 h-5" />}
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
                            <span className="px-2 py-0.5 rounded-full bg-slate-800/80 border border-slate-700">
                              {radio.bitrate_kbps || 128} kbps
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-slate-800/80 border border-slate-700">
                              {(radio.output_format || 'mp3').toUpperCase()}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Button size="sm" variant="outline" onClick={() => handleEdit(radio)}>
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive"
                            onClick={() => handleDelete(radio.id)}
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
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    </div>
  )
}

export default CadastroRadios
