document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('loginForm').addEventListener('submit', (e) => {
        e.preventDefault();
    
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData.entries());
    
        fetch('/authtificated_user', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showNotification('Успешный вход! Перенаправление...', 'success');
                setTimeout(() => {
                    window.location.href = data.next || '/profile';
                }, 1000);
            } else {
                showNotification(data.message || 'Ошибка входа', 'error');
            }
        })
        .catch(error => {
            showNotification('Ошибка сети: ' + error.message, 'error');
        });
    });
});