<script setup>
import { computed } from 'vue';
import { useTodoStore } from '../composables/useTodoStore';
import { Line } from 'vue-chartjs';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js';
import DraggableLegend from './DraggableLegend.vue';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend
);

const store = useTodoStore();
const dayNames = ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'];

const chartData = computed(() => {
  const days = store.weekDays.value;
  const labels = days.map((_, i) => dayNames[i]);

  const counts = {};
  store.STATUSES.forEach(s => {
    counts[s] = new Array(7).fill(0);
  });

  days.forEach((dateStr, index) => {
    const todos = store.weekData.value[dateStr] || [];
    todos.forEach(todo => {
      if (counts[todo.status]) {
        counts[todo.status][index]++;
      }
    });
  });

  const datasets = store.statusOrder.value.map((status, idx) => ({
    label: status,
    data: counts[status],
    fill: idx === 0 ? 'origin' : '-1',
    backgroundColor: `${getStatusColor(status)}40`,
    borderColor: getStatusColor(status),
    pointBackgroundColor: getStatusColor(status),
    tension: 0.0,
    stack: 'week',
  }));

  return { labels, datasets };
});

function getStatusColor(status) {
  const map = {
    Planned: '#3498db',
    Postponed: '#f39c12',
    Done: '#2ecc71',
    Cancelled: '#e74c3c',
    'Caught Up': '#9b59b6',
  };
  return map[status] || '#ccc';
}

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  elements: {
    // ← добавляем
    point: {
      radius: 0, // точки скрыты
    },
  },
  scales: {
    y: {
      stacked: true,
      beginAtZero: true,
      ticks: { stepSize: 1 },
    },
  },
  plugins: {
    filler: { propagate: false },
    legend: { display: false },
  },
  interaction: {
    mode: 'index',
    intersect: false,
  },
};
</script>

<template>
  <div class="week-stats">
    <h3>Распределение задач по статусам</h3>
    <div class="chart-container">
      <Line
        :data="chartData"
        :options="chartOptions"
      />
    </div>
    <DraggableLegend />
  </div>
</template>

<style scoped>
/* Стили контейнера остаются без изменений */
.week-stats {
  background: #fff;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}
.week-stats h3 {
  margin: 0 0 12px 0;
  font-size: 1.1rem;
  color: #333;
}
.chart-container {
  position: relative;
  height: 260px;
  margin-bottom: 16px;
}

@media (max-width: 600px) {
  .chart-container {
    position: relative;
    height: 140px;
    margin-bottom: 16px;
  }
}
</style>
