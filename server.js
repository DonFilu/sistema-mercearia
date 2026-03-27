function apiFetch(url, options = {}) {
    const userId = localStorage.getItem("userId");

    options.headers = options.headers || {};
    options.headers["Content-Type"] = "application/json";

    if (userId) {
        options.headers["x-user-id"] = userId;
    }

    return fetch(url, options);
}