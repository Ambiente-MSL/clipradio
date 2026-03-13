import React, { useDeferredValue, useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Cloud, Clock3, Hash, MapPin, Radio, RefreshCcw, Search, Sparkles } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

import apiClient from '@/lib/apiClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const formatDateTime = (value) => {
  if (!value) return 'Horario indisponivel';
  try {
    return format(new Date(value), "dd/MM/yyyy 'as' HH:mm:ss", { locale: ptBR });
  } catch (error) {
    return 'Horario indisponivel';
  }
};

const formatOffset = (value) => {
  const totalSeconds = Number(value);
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return 'Minutagem indisponivel';
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const resolveWordStyle = (word, index, maxCount, selected) => {
  const count = Number(word?.count || 0);
  const ratio = maxCount > 0 ? count / maxCount : 0;
  const fontSize = 14 + Math.round(ratio * 34);
  const rotation = ((index % 5) - 2) * 2;
  const color = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(word?.color || '').trim())
    ? String(word.color).trim()
    : null;

  return {
    fontSize: `${fontSize}px`,
    lineHeight: 1.1,
    transform: `rotate(${rotation}deg)`,
    color: color || undefined,
    borderColor: color ? `${color}55` : undefined,
    backgroundColor: color
      ? selected
        ? `${color}26`
        : `${color}14`
      : undefined,
  };
};

const SummaryCard = ({ icon: Icon, title, value, description, accentClass }) => (
  <Card className="border-slate-800 bg-slate-900/75 backdrop-blur-sm shadow-xl shadow-black/20">
    <CardContent className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-slate-500">{title}</p>
          <p className="mt-3 text-3xl font-black text-white">{value}</p>
          <p className="mt-2 text-sm text-slate-400">{description}</p>
        </div>
        <div className={`rounded-2xl border border-slate-700/80 bg-slate-950/70 p-3 ${accentClass}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </CardContent>
  </Card>
);

const NuvemPalavrasPage = () => {
  const { toast } = useToast();
  const [cloudData, setCloudData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedWordKey, setSelectedWordKey] = useState(null);
  const deferredSearch = useDeferredValue(search);

  const loadCloud = async ({ silent = false } = {}) => {
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const response = await apiClient.getTagsCloud({ occurrenceLimit: 1500 });
      setCloudData(response || null);
    } catch (error) {
      toast({
        title: 'Erro ao carregar nuvem',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadCloud();
  }, []);

  const normalizedSearch = String(deferredSearch || '').trim().toLowerCase();
  const summary = cloudData?.summary || {};
  const words = Array.isArray(cloudData?.words) ? cloudData.words : [];
  const matchedWords = words.filter((word) => Number(word?.count || 0) > 0);
  const searchableWords = matchedWords.filter((word) => {
    if (!normalizedSearch) return true;
    return String(word?.text || '').toLowerCase().includes(normalizedSearch);
  });
  const selectedWord = searchableWords.find((word) => word.key === selectedWordKey) || searchableWords[0] || null;
  const visibleOccurrences = (Array.isArray(cloudData?.occurrences) ? cloudData.occurrences : []).filter((occurrence) => {
    const matchesWord = selectedWord ? occurrence?.tag_key === selectedWord.key : true;
    if (!matchesWord) return false;
    if (!normalizedSearch) return true;
    return [
      occurrence?.tag_text,
      occurrence?.radio_nome,
      occurrence?.cidade,
      occurrence?.estado,
    ].some((value) => String(value || '').toLowerCase().includes(normalizedSearch));
  });
  const maxCount = searchableWords.reduce((currentMax, word) => {
    const nextCount = Number(word?.count || 0);
    return nextCount > currentMax ? nextCount : currentMax;
  }, 0);

  useEffect(() => {
    if (!searchableWords.length) {
      if (selectedWordKey !== null) setSelectedWordKey(null);
      return;
    }

    const stillVisible = searchableWords.some((word) => word.key === selectedWordKey);
    if (!stillVisible) {
      setSelectedWordKey(searchableWords[0].key);
    }
  }, [searchableWords, selectedWordKey]);

  return (
    <>
      <Helmet>
        <title>Nuvem de Palavras | Clipradio</title>
        <meta
          name="description"
          content="Visualize as tags mais citadas nas transcricoes, com radio, cidade e horario de aparicao."
        />
      </Helmet>

      <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.18),_transparent_34%),linear-gradient(180deg,_rgba(15,23,42,0.98)_0%,_rgba(2,6,23,1)_100%)] px-4 pb-16 pt-4 md:px-6">
        <div className="mx-auto max-w-7xl">
          <div className="rounded-[28px] border border-cyan-500/20 bg-slate-950/70 p-6 shadow-[0_24px_80px_rgba(8,145,178,0.16)] backdrop-blur-xl md:p-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl">
                <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-cyan-200">
                  <Sparkles className="h-3.5 w-3.5" />
                  Analise por tags
                </div>
                <h1 className="mt-5 text-4xl font-black tracking-tight text-white md:text-5xl">
                  Nuvem de palavras das tags
                </h1>
                <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300 md:text-lg">
                  Veja quais palavras cadastradas apareceram nas gravacoes transcritas, quantas vezes elas surgiram e
                  em qual radio, cidade e horario foram ouvidas.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="relative min-w-[260px]">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Filtrar palavra, radio ou cidade"
                    className="h-11 border-slate-700 bg-slate-900/70 pl-9 text-white placeholder:text-slate-500"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => loadCloud({ silent: true })}
                  className="h-11 border-slate-700 bg-slate-900/70 text-slate-100 hover:border-cyan-400 hover:bg-slate-800"
                >
                  <RefreshCcw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                  Atualizar
                </Button>
              </div>
            </div>

            <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <SummaryCard
                icon={Cloud}
                title="Palavras ativas"
                value={summary.matched_tags ?? 0}
                description={`${summary.total_tags ?? 0} tags unicas catalogadas para esta visao.`}
                accentClass="text-cyan-300"
              />
              <SummaryCard
                icon={Hash}
                title="Ocorrencias"
                value={summary.total_occurrences ?? 0}
                description="Total de vezes em que alguma tag apareceu nas transcricoes analisadas."
                accentClass="text-emerald-300"
              />
              <SummaryCard
                icon={Radio}
                title="Gravacoes lidas"
                value={summary.recordings_scanned ?? 0}
                description={`${summary.recordings_with_matches ?? 0} gravacoes tiveram pelo menos uma correspondencia.`}
                accentClass="text-amber-300"
              />
              <SummaryCard
                icon={Clock3}
                title="Ocorrencias listadas"
                value={summary.occurrences_returned ?? 0}
                description={
                  summary.occurrences_truncated
                    ? `Lista limitada a ${summary.occurrence_limit ?? 0} registros nesta tela.`
                    : 'Todas as ocorrencias detalhadas retornadas pela API.'
                }
                accentClass="text-fuchsia-300"
              />
            </div>
          </div>

          <div className="mt-8 grid gap-6 xl:grid-cols-[1.5fr_0.9fr]">
            <Card className="border-slate-800 bg-slate-900/80 shadow-2xl shadow-black/20">
              <CardHeader className="border-b border-slate-800">
                <CardTitle className="flex items-center gap-3 text-white">
                  <Cloud className="h-5 w-5 text-cyan-400" />
                  Nuvem
                </CardTitle>
                <CardDescription className="text-slate-400">
                  O tamanho de cada palavra representa a quantidade de aparicoes nas gravacoes transcritas.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6">
                {loading ? (
                  <div className="flex min-h-[360px] items-center justify-center">
                    <div className="h-10 w-10 animate-spin rounded-full border-2 border-cyan-500/30 border-t-cyan-400" />
                  </div>
                ) : searchableWords.length === 0 ? (
                  <div className="flex min-h-[360px] flex-col items-center justify-center rounded-3xl border border-dashed border-slate-700 bg-slate-950/50 px-6 text-center">
                    <p className="text-lg font-semibold text-white">Nenhuma ocorrencia encontrada.</p>
                    <p className="mt-2 max-w-md text-sm text-slate-400">
                      Verifique se existem transcricoes concluidas e se as tags cadastradas aparecem no texto.
                    </p>
                  </div>
                ) : (
                  <div className="flex min-h-[360px] flex-wrap items-center justify-center gap-3 rounded-[28px] border border-slate-800 bg-[linear-gradient(135deg,_rgba(8,47,73,0.45),_rgba(15,23,42,0.82))] p-6">
                    {searchableWords.map((word, index) => {
                      const selected = selectedWord?.key === word.key;
                      return (
                        <button
                          key={word.key}
                          type="button"
                          onClick={() => setSelectedWordKey(word.key)}
                          style={resolveWordStyle(word, index, maxCount, selected)}
                          className={`rounded-2xl border px-4 py-2 font-black tracking-tight transition-all duration-200 ${
                            selected
                              ? 'border-cyan-300 bg-cyan-500/12 text-white shadow-[0_12px_36px_rgba(6,182,212,0.18)]'
                              : 'border-slate-700/80 bg-slate-950/45 text-slate-200 hover:-translate-y-0.5 hover:border-cyan-500/50 hover:text-white'
                          }`}
                        >
                          {word.text}
                        </button>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-slate-800 bg-slate-900/80 shadow-2xl shadow-black/20">
              <CardHeader className="border-b border-slate-800">
                <CardTitle className="text-white">Detalhe da palavra</CardTitle>
                <CardDescription className="text-slate-400">
                  Radio, cidade e horario em que a tag apareceu.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6">
                {!selectedWord ? (
                  <div className="rounded-3xl border border-dashed border-slate-700 bg-slate-950/50 px-6 py-10 text-center">
                    <p className="font-semibold text-white">Selecione uma palavra na nuvem.</p>
                    <p className="mt-2 text-sm text-slate-400">
                      Os dados detalhados de ocorrencia aparecerao aqui.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="rounded-[28px] border border-slate-800 bg-slate-950/70 p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Palavra</p>
                          <h2 className="mt-3 text-3xl font-black text-white">{selectedWord.text}</h2>
                        </div>
                        <div className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-200">
                          {selectedWord.count} ocorrencias
                        </div>
                      </div>

                      <div className="mt-5 grid gap-3 sm:grid-cols-3">
                        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-3">
                          <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Gravacoes</p>
                          <p className="mt-2 text-2xl font-black text-white">{selectedWord.recordings_count}</p>
                        </div>
                        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-3">
                          <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Radios</p>
                          <p className="mt-2 text-2xl font-black text-white">{selectedWord.radios_count}</p>
                        </div>
                        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-3">
                          <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Cidades</p>
                          <p className="mt-2 text-2xl font-black text-white">{selectedWord.cities_count}</p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-5 space-y-3">
                      {(selectedWord.sample_occurrences || []).length > 0 ? (
                        selectedWord.sample_occurrences.map((occurrence, index) => (
                          <div
                            key={`${occurrence.gravacao_id}-${occurrence.offset_seconds ?? 'na'}-${index}`}
                            className="rounded-2xl border border-slate-800 bg-slate-950/55 p-4"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="font-semibold text-white">{occurrence.radio_nome || 'Radio'}</p>
                                <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-400">
                                  <span className="inline-flex items-center gap-1">
                                    <MapPin className="h-3.5 w-3.5" />
                                    {[occurrence.cidade, occurrence.estado].filter(Boolean).join(' / ') || 'Cidade indisponivel'}
                                  </span>
                                  <span className="inline-flex items-center gap-1">
                                    <Clock3 className="h-3.5 w-3.5" />
                                    {formatDateTime(occurrence.heard_at)}
                                  </span>
                                </div>
                              </div>
                              <div className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs font-semibold text-slate-300">
                                {formatOffset(occurrence.offset_seconds)}
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/55 px-4 py-8 text-center text-sm text-slate-400">
                          Nenhuma amostra detalhada disponivel para esta palavra.
                        </div>
                      )}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="mt-6 border-slate-800 bg-slate-900/80 shadow-2xl shadow-black/20">
            <CardHeader className="border-b border-slate-800">
              <CardTitle className="text-white">Ocorrencias detalhadas</CardTitle>
              <CardDescription className="text-slate-400">
                {selectedWord
                  ? `Mostrando onde "${selectedWord.text}" apareceu nas gravacoes.`
                  : 'Selecione uma palavra para filtrar as ocorrencias.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="grid grid-cols-[minmax(180px,1.1fr)_minmax(180px,1fr)_minmax(200px,1fr)_120px] gap-4 border-b border-slate-800 bg-slate-950/70 px-6 py-4 text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                <span>Palavra</span>
                <span>Radio / Cidade</span>
                <span>Horario</span>
                <span className="text-right">Minutagem</span>
              </div>

              {loading ? (
                <div className="flex items-center justify-center px-6 py-16">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-500/30 border-t-cyan-400" />
                </div>
              ) : visibleOccurrences.length === 0 ? (
                <div className="px-6 py-16 text-center">
                  <p className="text-lg font-semibold text-white">Nenhuma ocorrencia para exibir.</p>
                  <p className="mt-2 text-sm text-slate-400">
                    Ajuste o filtro ou selecione outra palavra na nuvem.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-800">
                  {visibleOccurrences.map((occurrence, index) => (
                    <div
                      key={`${occurrence.gravacao_id}-${occurrence.tag_key}-${occurrence.offset_seconds ?? 'na'}-${index}`}
                      className="grid grid-cols-[minmax(180px,1.1fr)_minmax(180px,1fr)_minmax(200px,1fr)_120px] gap-4 px-6 py-4 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-white">{occurrence.tag_text}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {occurrence.count > 1 ? `${occurrence.count} vezes nesta gravacao` : '1 vez nesta gravacao'}
                        </p>
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-100">{occurrence.radio_nome || 'Radio indisponivel'}</p>
                        <p className="mt-1 truncate text-xs text-slate-400">
                          {[occurrence.cidade, occurrence.estado].filter(Boolean).join(' / ') || 'Cidade indisponivel'}
                        </p>
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-slate-100">{formatDateTime(occurrence.heard_at)}</p>
                        <p className="mt-1 text-xs text-slate-400">
                          {occurrence.exact_time ? 'Horario calculado pelo timestamp da palavra.' : 'Horario aproximado pelo segmento ou indisponivel.'}
                        </p>
                      </div>
                      <div className="text-right font-mono text-slate-200">{formatOffset(occurrence.offset_seconds)}</div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
};

export default NuvemPalavrasPage;
