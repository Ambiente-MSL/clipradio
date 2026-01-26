const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const envTimeout = Number(import.meta.env.VITE_API_TIMEOUT_MS);
const DEFAULT_TIMEOUT_MS = Number.isFinite(envTimeout) && envTimeout > 0 ? envTimeout : 25000;

class ApiClient {
  constructor() {
    this.baseURL = API_URL;
    this.token = localStorage.getItem('auth_token');
  }

  setToken(token) {
    this.token = token;
    if (token) {
      localStorage.setItem('auth_token', token);
    } else {
      localStorage.removeItem('auth_token');
    }
  }

  async request(endpoint, options = {}) {
    const { timeoutMs = DEFAULT_TIMEOUT_MS, headers: customHeaders, ...fetchOptions } = options;
    const url = `${this.baseURL}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...customHeaders,
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const controller = new AbortController();
    let timeoutId = null;
    const resolvedTimeoutMs = Number.isFinite(Number(timeoutMs)) && Number(timeoutMs) > 0
      ? Number(timeoutMs)
      : DEFAULT_TIMEOUT_MS;
    const clearRequestTimeout = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };
    timeoutId = setTimeout(() => controller.abort(), resolvedTimeoutMs);

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

  async getMe() {
    return this.request('/auth/me');
  }

  async logout() {
    await this.request('/auth/logout', { method: 'POST' });
    this.setToken(null);
  }

  // ============ RADIOS ============
  async getRadios() {
    return this.request('/radios');
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
  async getGravacoes(filters = {}) {
    const params = new URLSearchParams();
    if (filters.radioId) params.append('radio_id', filters.radioId);
    if (filters.data) params.append('data', filters.data);
    if (filters.cidade) params.append('cidade', filters.cidade);
    if (filters.estado) params.append('estado', filters.estado);
    if (filters.status) params.append('status', filters.status);
    if (filters.tipo) params.append('tipo', filters.tipo);
    if (filters.page != null) params.append('page', filters.page);
    if (filters.perPage != null) params.append('per_page', filters.perPage);
    if (filters.limit != null) params.append('limit', filters.limit);
    if (filters.offset != null) params.append('offset', filters.offset);
    if (filters.includeStats) params.append('include_stats', 'true');
    
    const query = params.toString();
    return this.request(`/gravacoes${query ? `?${query}` : ''}`);
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

  async getAdminQuickStats() {
    return this.request('/gravacoes/admin/quick-stats');
  }

  // ============ ADMIN ============
  async getAdminUsers() {
    return this.request('/admin/users');
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

  async getAdminClients() {
    return this.request('/admin/clients');
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
  async getAgendamentos() {
    return this.request('/agendamentos');
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
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
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
  async getTags() {
    return this.request('/tags');
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

  async getOngoingRecordings() {
    return this.request('/gravacoes/ongoing');
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
      const wsUrl = API_URL.replace('/api', '').replace('http', 'ws');
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
const savedToken = localStorage.getItem('auth_token');
if (savedToken) {
  apiClient.setToken(savedToken);
}

export default apiClient;

