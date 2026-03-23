const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";
const TOKEN_KEY = "csc_brape_token";

function getAuthToken() {
  return sessionStorage.getItem(TOKEN_KEY) || "";
}

function getAuthHeaders() {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
      ...(options?.headers || {})
    },
    ...options,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed: ${res.status}`);
  }

  return res.json();
}

export const dbService = {
  setAuthToken(token: string) {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
  },

  clearAuthToken() {
    sessionStorage.removeItem(TOKEN_KEY);
  },

  getAuthToken() {
    return getAuthToken();
  },

  async saveProjects(projects: any[]) {
    try {
      await request("/projects/bulk", {
        method: "POST",
        body: JSON.stringify({ projects })
      });
    } catch (e) {
      console.error("Erro ao salvar projetos no backend:", e);
      throw e;
    }
  },

  async upsertProject(project: any) {
    return request<any>(`/projects/${project.id}`, {
      method: "PUT",
      body: JSON.stringify({ project })
    });
  },

  async deleteProject(projectId: string) {
    return request<{ ok: boolean }>(`/projects/${projectId}`, {
      method: "DELETE"
    });
  },

  async upsertProjectOrder(projectId: string, order: any) {
    return request<any>(`/projects/${projectId}/orders/${order.id}`, {
      method: "PUT",
      body: JSON.stringify({ order })
    });
  },

  async deleteProjectOrder(projectId: string, orderId: string) {
    return request<{ ok: boolean }>(`/projects/${projectId}/orders/${orderId}`, {
      method: "DELETE"
    });
  },

  async getProjects() {
    try {
      const data = await request<any[]>("/projects");
      return data && data.length > 0 ? data : null;
    } catch (e) {
      console.error("Erro ao buscar projetos do backend:", e);
      return null;
    }
  },

  async saveUsers(users: any[]) {
    try {
      await request("/users/bulk", {
        method: "POST",
        body: JSON.stringify({ users })
      });
    } catch (e) {
      console.error("Erro ao salvar usuarios no backend:", e);
      throw e;
    }
  },

  async upsertUser(user: any) {
    return request<any>(`/users/${user.id}`, {
      method: "PUT",
      body: JSON.stringify({ user })
    });
  },

  async deleteUser(userId: string) {
    return request<{ ok: boolean }>(`/users/${userId}`, {
      method: "DELETE"
    });
  },

  async getUsers() {
    try {
      const data = await request<any[]>("/users");
      return data && data.length > 0 ? data : null;
    } catch (e) {
      console.error("Erro ao buscar usuarios do backend:", e);
      return null;
    }
  },

  async getSectors() {
    try {
      const data = await request<any[]>("/sectors");
      return data ?? null;
    } catch (e) {
      console.error("Erro ao buscar setores do backend:", e);
      return null;
    }
  },

  async upsertSector(sector: any) {
    return request<any>(`/sectors/${sector.id || "new"}`, {
      method: "PUT",
      body: JSON.stringify({ sector })
    });
  },

  async saveSectorStatuses(sectorId: string, statuses: string[]) {
    return request<any>(`/sectors/${sectorId}/statuses`, {
      method: "PUT",
      body: JSON.stringify({ statuses })
    });
  },

  async saveOrderTypes(orderTypes: string[]) {
    try {
      await request("/order-types", {
        method: "PUT",
        body: JSON.stringify({ orderTypes })
      });
    } catch (e) {
      console.error("Erro ao salvar tipos de pedido:", e);
    }
  },

  async getOrderTypes() {
    try {
      const data = await request<string[]>("/order-types");
      return data ?? null;
    } catch {
      return null;
    }
  },

  async importOrders(rows: any[]) {
    return request<{ imported: any[]; skipped: any[] }>("/orders/import", {
      method: "POST",
      body: JSON.stringify({ rows })
    });
  },

  async login(email: string, password: string) {
    const result = await request<{ token: string; user: any }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
    this.setAuthToken(result.token);
    return result;
  },

  async me() {
    return request<any>("/auth/me");
  },

  async updateMyProfile(payload: { name: string; currentPassword?: string; newPassword?: string }) {
    return request<any>("/auth/profile", {
      method: "PUT",
      body: JSON.stringify(payload)
    });
  }
};



