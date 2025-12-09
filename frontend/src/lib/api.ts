const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3000";

interface ApiResponse<T> {
  success?: boolean;
  data?: T;
  error?: string;
  message?: string;
  [key: string]: any;
}

class ApiClient {
  private async request<T>(endpoint: string, options?: RequestInit): Promise<ApiResponse<T>> {
    try {
      const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...options?.headers
        }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || "Request failed");
      }

      return data;
    } catch (error: any) {
      console.error("API Error:", error);
      return {
        success: false,
        error: error.message || "Network error"
      };
    }
  }

  // Portal Endpoints
  async getPortal() {
    return this.request<any>("/");
  }

  async initiatePayment(planId: string, phoneNumber?: string) {
    return this.request<any>("/payment/initiate", {
      method: "POST",
      body: JSON.stringify({ planId, phoneNumber })
    });
  }

  async getSessionStatus() {
    return this.request<any>("/session/status");
  }

  async disconnectSession() {
    return this.request<any>("/session/disconnect", {
      method: "POST"
    });
  }

  // Admin Endpoints
  async getTenants() {
    return this.request<any>("/api/admin/tenants");
  }

  async createTenant(data: any) {
    return this.request<any>("/api/admin/tenants", {
      method: "POST",
      body: JSON.stringify(data)
    });
  }

  async getTenant(tenantId: string) {
    return this.request<any>(`/api/admin/tenants/${tenantId}`);
  }

  async updateTenant(tenantId: string, data: any) {
    return this.request<any>(`/api/admin/tenants/${tenantId}`, {
      method: "PUT",
      body: JSON.stringify(data)
    });
  }

  async deleteTenant(tenantId: string) {
    return this.request<any>(`/api/admin/tenants/${tenantId}`, {
      method: "DELETE"
    });
  }

  async testConnection(tenantId: string) {
    return this.request<any>(`/api/admin/tenants/${tenantId}/test`, {
      method: "POST"
    });
  }

  async getDashboard() {
    return this.request<any>("/api/admin/dashboard");
  }

  async getTenantAnalytics(tenantId: string, days: number = 7) {
    return this.request<any>(`/api/admin/tenants/${tenantId}/analytics?days=${days}`);
  }
}

export const api = new ApiClient();
