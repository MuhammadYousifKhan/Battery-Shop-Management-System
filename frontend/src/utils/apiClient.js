import API_URL from '../apiConfig';

const request = async (endpoint, options = {}) => {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  const token = localStorage.getItem('token');
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const config = {
    ...options,
    headers,
  };

  try {
    const response = await fetch(`${API_URL}${endpoint}`, config);

    // --- Handle Binary/Blob Responses (PDFs) ---
    if (options.responseType === 'blob') {
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || "Download failed");
        }
        return await response.blob();
    }

    // Standard JSON/Text handling
    const contentType = response.headers.get("content-type");
    let data;
    
    if (contentType && contentType.indexOf("application/json") !== -1) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    if (!response.ok) {
      if (response.status === 401) {
        if (window.location.pathname !== '/login') {
            localStorage.clear();
            window.location.href = '/login'; 
            return;
        }
      }

      const errorMessage = (data && data.message) ? data.message : (typeof data === 'string' ? data : "Something went wrong");
      const error = new Error(errorMessage);
      error.response = {
        data: typeof data === 'object' ? data : { message: data },
        status: response.status
      };
      throw error;
    }

    return data;

  } catch (error) {
    throw error;
  }
};

export const apiClient = {
  get: (endpoint, customConfig = {}) => request(endpoint, { method: 'GET', ...customConfig }),
  post: (endpoint, body, customConfig = {}) => request(endpoint, { method: 'POST', body: JSON.stringify(body), ...customConfig }),
  put: (endpoint, body, customConfig = {}) => request(endpoint, { method: 'PUT', body: JSON.stringify(body), ...customConfig }),
  patch: (endpoint, body, customConfig = {}) => request(endpoint, { method: 'PATCH', body: JSON.stringify(body), ...customConfig }),
  delete: (endpoint, customConfig = {}) => request(endpoint, { method: 'DELETE', ...customConfig }),
};