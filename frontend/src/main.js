import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
import './assets/global.css';

if ('serviceWorker' in navigator) {
  navigator.serviceWorker
    .register('/todo/sw.js')
    .then(() => console.log('Service Worker зарегистрирован'))
    .catch(err => console.warn('Ошибка регистрации SW:', err));
}

const app = createApp(App);
app.use(router);
app.mount('#app');
