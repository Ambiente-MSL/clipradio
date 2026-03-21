import { API_URL, WS_BASE_URL } from '@/lib/apiConfig';
const envTimeout = Number(import.meta.env.VITE_API_TIMEOUT_MS);
const DEFAULT_TIMEOUT_MS = Number.isFinite(envTimeout) && envTimeout > 0 ? envTimeout : 25000;
const AUTH_TOKEN_KEY = 'auth_token';

const getStoredToken = () => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(AUTH_TOKEN_KEY);
};

class ApiClient {
  constructor() {
    this.baseURL = API_URL;
    this.token = getStoredToken();
  }

  setToken(token) {
    this.token = token;
    if (token) {
      localStorage.setItem(AUTH_TOKEN_KEY, token);
    } else {
      localStorage.removeItem(AUTH_TOKEN_KEY);
    }
  }

  syncTokenFromStorage() {
    const storedToken = getStoredToken();
    if (storedToken !== this.token) {
      this.token = storedToken;
    }
    return this.token;
  }

  async request(endpoint, options = {}) {
    const {
      timeoutMs = DEFAULT_TIMEOUT_MS,
      headers: customHeaders,
      signal: externalSignal,
      ...fetchOptions
    } = options;
    const url = `${this.baseURL}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...customHeaders,
    };

    const token = this.syncTokenFromStorage();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const controller = new AbortController();
    let timeoutId = null;
    let timeoutTriggered = false;
    const resolvedTimeoutMs = Number.isFinite(Number(timeoutMs)) && Number(timeoutMs) > 0
      ? Number(timeoutMs)
      : DEFAULT_TIMEOUT_MS;
    const abortFromExternalSignal = () => {
      controller.abort(externalSignal?.reason);
    };
    if (externalSignal) {
      if (externalSignal.aborted) {
        abortFromExternalSignal();
      } else {
        externalSignal.addEventListener('abort', abortFromExternalSignal, { once: true });
      }
    }
    const clearRequestTimeout = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };
    timeoutId = setTimeout(() => {
      timeoutTriggered = true;
      controller.abort(new DOMException('Timeout exceeded', 'AbortError'));
    }, resolvedTimeoutMs);

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        headers,
        signal: controller.signal,
      });

      clearRequestTimeout();
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const err = new Error(data.error || `HTTP error! status: ${response.status}`);
        err.status = response.status;
        err.data = data;
        throw err;
      }

      return data;
    } catch (error) {
      if (error?.name === 'AbortError' || error?.code === 20) {
        if (!timeoutTriggered) {
          throw error;
        }
        const err = new Error('Tempo de resposta excedido. Tente novamente.');
        err.code = 'TIMEOUT';
        throw err;
      }
      if (error instanceof TypeError) {
        const err = new Error('Nao foi possivel conectar ao servidor. Tente novamente.');
        err.code = 'NETWORK';
        throw err;
      }
      console.error('API Request Error:', error);
      throw error;
    } finally {
      clearRequestTimeout();
      externalSignal?.removeEventListener?.('abort', abortFromExternalSignal);
    }
  }

  // ============ AUTH ============
  async login(email, password) {
    const data = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (data.token) {
      this.setToken(data.token);
    }
    return data;
  }

  async register(email, password, nome) {
    const data = await this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, nome }),
    });
    if (data.token) {
      this.setToken(data.token);
    }
    return data;
  }

  async getMe(options = {}) {
    return this.request('/auth/me', options);
  }

  async logout() {
    await this.request('/auth/logout', { method: 'POST' });
    this.setToken(null);
  }

  // ============ RADIOS ============
  async getRadios(options = {}) {
    return this.request('/radios', options);
  }

  async getRadio(id) {
    return this.request(`/radios/${id}`);
  }

  async createRadio(data) {
    return this.request('/radios', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateRadio(id, data) {
    return this.request(`/radios/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteRadio(id) {
    return this.request(`/radios/${id}`, {
      method: 'DELETE',
    });
  }

  // ============ GRAVACOES ============
  async getGravacoes(filters = {}, options = {}) {
    const params = new URLSearchParams();
    if (filters.radioId) params.append('radio_id', filters.radioId);
    if (filters.data) params.append('data', filters.data);
    if (filters.cidade) params.append('cidade', filters.cidade);
    if (filters.estado) params.append('estado', filters.estado);
    if (filters.status) params.append('status', filters.status);
    if (filters.tipo) params.append('tipo', filters.tipo);
    if (filters.transcricaoStatus) {
      const transcricaoStatus = Array.isArray(filters.transcricaoStatus)
        ? filters.transcricaoStatus.join(',')
        : filters.transcricaoStatus;
      params.append('transcricao_status', transcricaoStatus);
    }
    if (filters.page != null) params.append('page', filters.page);
    if (filters.perPage != null) params.append('per_page', filters.perPage);
    if (filters.limit != null) params.append('limit', filters.limit);
    if (filters.offset != null) params.append('offset', filters.offset);
    if (filters.includeStats) params.append('include_stats', 'true');
    
    const query = params.toString();
    return this.request(`/gravacoes${query ? `?${query}` : ''}`, options);
  }

  async getGravacao(id) {
    return this.request(`/gravacoes/${id}`);
  }

  async getTranscricao(gravacaoId) {
    return this.request(`/gravacoes/${gravacaoId}/transcricao`);
  }

  async getTranscricaoSegmentos(gravacaoId) {
    return this.request(`/gravacoes/${gravacaoId}/transcricao/segmentos`);
  }

  async startTranscricao(gravacaoId, { force = false } = {}) {
    return this.request(`/gravacoes/${gravacaoId}/transcricao`, {
      method: 'POST',
      body: JSON.stringify({ force }),
    });
  }

  async stopTranscricao(gravacaoId) {
    return this.request(`/gravacoes/${gravacaoId}/transcricao/stop`, {
      method: 'POST',
    });
  }

  async createGravacao(data) {
    return this.request('/gravacoes', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async deleteGravacao(id) {
    return this.request(`/gravacoes/${id}`, {
      method: 'DELETE',
    });
  }

  async batchDeleteGravacoes(ids) {
    return this.request('/gravacoes/batch-delete', {
      method: 'POST',
      body: JSON.stringify({ gravacao_ids: ids }),
    });
  }

  async getGravacoesStats() {
    return this.request('/gravacoes/stats');
  }

  async getAdminQuickStats(options = {}) {
    return this.request('/gravacoes/admin/quick-stats', options);
  }

  // ============ ADMIN ============
  async getAdminUsers(options = {}) {
    return this.request('/admin/users', options);
  }

  async createAdminUser(data) {
    return this.request('/admin/users', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateAdminUser(id, data) {
    return this.request(`/admin/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteAdminUser(id) {
    return this.request(`/admin/users/${id}`, {
      method: 'DELETE',
    });
  }

  async getAdminClients(options = {}) {
    return this.request('/admin/clients', options);
  }

  async createAdminClient(data) {
    return this.request('/admin/clients', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateAdminClient(id, data) {
    return this.request(`/admin/clients/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteAdminClient(id) {
    return this.request(`/admin/clients/${id}`, {
      method: 'DELETE',
    });
  }

  // ============ AGENDAMENTOS ============
  async getAgendamentos(filters = {}, options = {}) {
    const params = new URLSearchParams();
    if (filters.status) params.append('status', filters.status);
    if (filters.limit != null) params.append('limit', filters.limit);
    const query = params.toString();
    return this.request(`/agendamentos${query ? `?${query}` : ''}`, options);
  }

  async getAgendamento(id) {
    return this.request(`/agendamentos/${id}`);
  }

  async createAgendamento(data) {
    return this.request('/agendamentos', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateAgendamento(id, data) {
    return this.request(`/agendamentos/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteAgendamento(id) {
    return this.request(`/agendamentos/${id}`, {
      method: 'DELETE',
    });
  }

  async toggleAgendamentoStatus(id) {
    return this.request(`/agendamentos/${id}/toggle-status`, {
      method: 'POST',
    });
  }

  async downloadAgendamentosReport(format = 'csv', { startDate, endDate } = {}) {
    const params = new URLSearchParams({ format });
    if (startDate) {
      params.append('start_date', startDate);
    }
    if (endDate) {
      params.append('end_date', endDate);
    }
    const url = `${this.baseURL}/agendamentos/report?${params.toString()}`;
    const headers = {};
    const token = this.syncTokenFromStorage();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const response = await fetch(url, { headers });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `Falha ao gerar relatório (${response.status})`);
    }
    const blob = await response.blob();
    const disposition = response.headers.get('Content-Disposition') || '';
    const match = disposition.match(/filename="?(.+?)"?$/i);
    const filename = match ? match[1] : `agendamentos.${format}`;
    return { blob, filename };
  }

  // ============ TAGS ============
  async getTags(options = {}) {
    return this.request('/tags', options);
  }

  async getTag(id) {
    return this.request(`/tags/${id}`);
  }

  async createTag(data) {
    return this.request('/tags', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateTag(id, data) {
    return this.request(`/tags/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteTag(id) {
    return this.request(`/tags/${id}`, {
      method: 'DELETE',
    });
  }

  async getTagsCloud({ occurrenceLimit } = {}) {
    const params = new URLSearchParams();
    if (occurrenceLimit != null) params.append('occurrence_limit', occurrenceLimit);
    const query = params.toString();
    return this.request(`/tags/cloud${query ? `?${query}` : ''}`);
  }

  async addTagToGravacao(gravacaoId, tagId) {
    return this.request(`/tags/gravacao/${gravacaoId}`, {
      method: 'POST',
      body: JSON.stringify({ tag_id: tagId }),
    });
  }

  async removeTagFromGravacao(gravacaoId, tagId) {
    return this.request(`/tags/gravacao/${gravacaoId}/${tagId}`, {
      method: 'DELETE',
    });
  }

  // ============ RECORDING ============
  async startRecording(recordingId) {
    return this.request('/recording/start', {
      method: 'POST',
      body: JSON.stringify({ recording_id: recordingId }),
    });
  }

  async stopRecording(recordingId) {
    return this.request(`/recording/stop/${recordingId}`, {
      method: 'POST',
    });
  }

  async getOngoingRecordings(options = {}) {
    return this.request('/gravacoes/ongoing', { timeoutMs: 10000, ...options });
  }

  async processAudioWithAI(gravacaoId, palavrasChave) {
    return this.request('/recording/process-ai', {
      method: 'POST',
      body: JSON.stringify({
        gravacao_id: gravacaoId,
        palavras_chave: palavrasChave,
      }),
    });
  }

  // ============ WEBSOCKET ============
  connectWebSocket(userId, onMessage) {
    // Implementar conexão WebSocket com Flask-SocketIO
    // Requer instalação: npm install socket.io-client
    try {
      const { io } = require('socket.io-client');
      const wsUrl = WS_BASE_URL || API_URL.replace('/api', '').replace('http', 'ws');
      const socket = io(wsUrl);
      
      socket.on('connect', () => {
        socket.emit('subscribe', { channel: `user_${userId}` });
      });

      socket.on('update', (data) => {
        if (onMessage) {
          onMessage(data);
        }
      });

      socket.on('subscribed', (data) => {
        console.log('Subscribed to channel:', data.channel);
      });

      return () => {
        socket.disconnect();
      };
    } catch (error) {
      console.warn('WebSocket not available. Install socket.io-client:', error);
      return () => {};
    }
  }
}

const apiClient = new ApiClient();

// Inicializar token se existir
const savedToken = getStoredToken();
if (savedToken) {
  apiClient.setToken(savedToken);
}

export default apiClient;

