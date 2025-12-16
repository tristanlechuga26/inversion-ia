
        import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
        import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
        import { getFirestore, doc, addDoc, onSnapshot, collection, query, deleteDoc, orderBy } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
        import { setLogLevel } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
        
        // Deshabilitar logs de depuración para producción, pero mantener aquí si se desea
        // setLogLevel('Debug'); 

        // --- GLOBAL CONSTANTS & CONFIG ---
        const firebaseConfig = JSON.parse(typeof __firebase_config !== 'undefined' ? __firebase_config : '{}');
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'finanzas-pro-default';
        
        // --- FIREBASE INITIALIZATION ---
        const app = initializeApp(firebaseConfig);
        window.auth = getAuth(app);
        window.db = getFirestore(app);

        // --- GLOBAL STATE ---
        window.state = {
            user: null,
            transactions: [],
            activeTab: 'dashboard',
            loading: true,
            charts: {} // To store Chart.js instances
        };

        // --- CONSTANTS ---
        const RISK_PROFILES = {
            conservador: {
                label: 'Conservador',
                allocation: [
                    { name: 'Renta Fija', value: 60, color: '#3b82f6' },
                    { name: 'Acciones', value: 30, color: '#10b981' },
                    { name: 'Efectivo', value: 10, color: '#f59e0b' }
                ],
                returnRate: 0.055,
                desc: 'Prioriza la seguridad del capital. Ideal para metas a corto plazo.'
            },
            moderado: {
                label: 'Moderado',
                allocation: [
                    { name: 'Renta Fija', value: 40, color: '#3b82f6' },
                    { name: 'Acciones', value: 50, color: '#10b981' },
                    { name: 'Efectivo', value: 10, color: '#f59e0b' }
                ],
                returnRate: 0.075,
                desc: 'Equilibrio entre seguridad y crecimiento. Horizonte medio.'
            },
            agresivo: {
                label: 'Agresivo',
                allocation: [
                    { name: 'Renta Fija', value: 20, color: '#3b82f6' },
                    { name: 'Acciones', value: 70, color: '#10b981' },
                    { name: 'Efectivo', value: 10, color: '#f59e0b' }
                ],
                returnRate: 0.095,
                desc: 'Maximiza el crecimiento a largo plazo. Alta tolerancia a volatilidad.'
            }
        };

        const CATEGORIES = [
            { id: 'salario', label: 'Salario', type: 'income', color: '#10b981' },
            { id: 'inversion', label: 'Retorno Inversión', type: 'income', color: '#34d399' },
            { id: 'otros_ingresos', label: 'Otros Ingresos', type: 'income', color: '#6ee7b7' },
            { id: 'vivienda', label: 'Vivienda', type: 'expense', color: '#ef4444' },
            { id: 'alimentacion', label: 'Alimentación', type: 'expense', color: '#f87171' },
            { id: 'transporte', label: 'Transporte', type: 'expense', color: '#fca5a5' },
            { id: 'ocio', label: 'Ocio / Entretenimiento', type: 'expense', color: '#fbbf24' },
            { id: 'servicios', label: 'Servicios', type: 'expense', color: '#fcd34d' },
            { id: 'salud', label: 'Salud', type: 'expense', color: '#60a5fa' },
            { id: 'deudas', label: 'Pago Deudas', type: 'expense', color: '#93c5fd' },
        ];

        const TABS = [
            { id: 'dashboard', icon: 'trending-up', label: 'Dashboard' },
            { id: 'gastos', icon: 'wallet', label: 'Control Gastos' },
            { id: 'salud', icon: 'activity', label: 'Salud Financiera' },
            { id: 'portafolio', icon: 'pie-chart', label: 'Inversiones' },
        ];

        // --- UTILITY FUNCTIONS ---
        window.formatCurrency = (amount) => {
            if (typeof amount !== 'number') return 'N/A';
            return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amount);
        };

        window.setTab = (tabId) => {
            window.state.activeTab = tabId;
            renderApp();
        };
        
        window.renderIcon = (name, className = 'w-5 h-5') => {
            const icon = lucide.icons[name];
            if (!icon) return '';
            return icon.toSvg({ class: className });
        };
        
        window.destroyCharts = () => {
            Object.values(window.state.charts).forEach(chart => {
                if (chart) chart.destroy();
            });
            window.state.charts = {};
        };
        
        // --- FIREBASE DATA HANDLING ---

        window.fetchTransactions = () => {
            if (!window.state.user) return;
            const userUid = window.state.user.uid;
            
            // Path: /artifacts/{appId}/users/{userId}/transactions
            const transactionsColRef = collection(window.db, 'artifacts', appId, 'users', userUid, 'transactions');

            const q = query(transactionsColRef, orderBy('date', 'desc'));
            
            onSnapshot(q, 
                (snapshot) => {
                    window.state.transactions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    window.state.loading = false;
                    renderApp(); // Re-render the app on data change
                },
                (error) => {
                    console.error("Error fetching transactions:", error);
                    window.state.loading = false;
                    renderApp();
                }
            );
        };

        window.deleteTransaction = async (id) => {
            if(!window.state.user) return;
            // doc(db, 'artifacts', appId, 'users', userId, 'transactions', id)
            const docRef = doc(window.db, 'artifacts', appId, 'users', window.state.user.uid, 'transactions', id);
            try {
                await deleteDoc(docRef);
                console.log("Transacción eliminada:", id);
            } catch (e) {
                console.error("Error eliminando documento:", e);
            }
        };

        // --- FINANCIAL METRICS CALCULATION ---
        window.calculateMetrics = () => {
            const transactions = window.state.transactions;
            const totalIncome = transactions.filter(t => t.type === 'income').reduce((acc, curr) => acc + curr.amount, 0);
            const totalExpense = transactions.filter(t => t.type === 'expense').reduce((acc, curr) => acc + curr.amount, 0);
            const balance = totalIncome - totalExpense;
            
            // Ratio de Ahorro
            const savingsRate = totalIncome > 0 ? ((totalIncome - totalExpense) / totalIncome) * 100 : 0;
            
            // Gasto mensual promedio (simplificado para la demo: se usa el gasto total si el balance es positivo, sino 1)
            const monthlyExpenses = totalExpense > 0 ? totalExpense : 1; 
            const emergencyMonths = balance > 0 ? balance / monthlyExpenses : 0;

            // Desglose por categoría (solo gastos)
            const categoryData = transactions
                .filter(t => t.type === 'expense')
                .reduce((acc, curr) => {
                    const cat = CATEGORIES.find(c => c.id === curr.category)?.label || curr.category;
                    if (!acc[cat]) acc[cat] = 0;
                    acc[cat] += curr.amount;
                    return acc;
                }, {});

            const chartData = Object.keys(categoryData).map(key => ({
                name: key,
                value: categoryData[key],
                color: CATEGORIES.find(c => c.label === key)?.color || '#94a3b8'
            }));

            return {
                totalIncome,
                totalExpense,
                balance,
                savingsRate: Math.max(0, savingsRate).toFixed(1), // Asegura que no sea negativo
                emergencyMonths: Math.max(0, emergencyMonths).toFixed(1),
                chartData,
                monthlyExpenses // Usado para proyecciones
            };
        };

        // --- RENDER FUNCTIONS (UI) ---

        // 1. RENDER NAVIGATION
        window.renderNav = () => {
            const navContainer = document.getElementById('nav-container');
            const mobileNav = document.getElementById('mobile-nav');

            const createNavButton = (item, isMobile) => {
                const isActive = window.state.activeTab === item.id;
                return `
                    <button
                        onclick="setTab('${item.id}')"
                        class="w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                            isActive
                                ? 'bg-indigo-50 dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 font-medium'
                                : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'
                        } ${isMobile ? 'justify-center p-2' : ''}"
                    >
                        ${window.renderIcon(item.icon, isMobile ? 'w-6 h-6' : 'w-5 h-5')}
                        <span class="${isMobile ? 'hidden' : ''}">${item.label}</span>
                    </button>
                `;
            };

            navContainer.innerHTML = TABS.map(item => createNavButton(item, false)).join('');
            mobileNav.innerHTML = TABS.map(item => createNavButton(item, true)).join('');
            lucide.createIcons(); // Re-render icons after injection
        };

        // 2. RENDER DASHBOARD
        window.renderDashboard = (metrics) => {
            const content = document.getElementById('main-content');
            
            content.innerHTML = `
                <div class="space-y-6">
                    <header class="mb-8">
                        <h2 class="text-3xl font-bold">Resumen General</h2>
                        <p class="text-slate-500">Bienvenido a tu centro de control financiero.</p>
                    </header>

                    <!-- METRICS CARDS -->
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div class="bg-gradient-to-br from-indigo-500 to-indigo-700 text-white p-6 rounded-2xl shadow-lg">
                            <p class="text-indigo-100 text-sm font-medium mb-1">Patrimonio Neto (Balance)</p>
                            <h3 class="text-3xl font-bold">${window.formatCurrency(metrics.balance)}</h3>
                            <div class="mt-4 flex items-center gap-2 text-xs bg-white/20 w-fit px-2 py-1 rounded-full">
                                ${window.renderIcon('trending-up', 'w-4 h-4')}
                                <span>Saldo acumulado</span>
                            </div>
                        </div>

                        <div class="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700">
                            <div class="flex justify-between items-start mb-4">
                                <div>
                                <p class="text-slate-500 text-sm">Ingresos Totales</p>
                                <h3 class="text-2xl font-bold text-emerald-500">${window.formatCurrency(metrics.totalIncome)}</h3>
                                </div>
                                <div class="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg text-emerald-600">
                                ${window.renderIcon('plus', 'w-5 h-5')}
                                </div>
                            </div>
                        </div>

                        <div class="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700">
                            <div class="flex justify-between items-start mb-4">
                                <div>
                                <p class="text-slate-500 text-sm">Gastos Totales</p>
                                <h3 class="text-2xl font-bold text-rose-500">${window.formatCurrency(metrics.totalExpense)}</h3>
                                </div>
                                <div class="p-2 bg-rose-100 dark:bg-rose-900/30 rounded-lg text-rose-600">
                                ${window.renderIcon('minus', 'w-5 h-5')}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div class="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700">
                            <h3 class="font-bold mb-6">Distribución de Gastos</h3>
                            <div class="chart-container">
                                <canvas id="dashboard-bar-chart"></canvas>
                            </div>
                        </div>

                        <div class="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col justify-center">
                            <h3 class="font-bold mb-4">Acciones Rápidas</h3>
                            <div class="space-y-3">
                                <button onclick="showAddModal('expense')" class="w-full flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-700 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors">
                                    <span class="flex items-center gap-3">
                                        <div class="bg-indigo-100 dark:bg-indigo-900 p-2 rounded-full text-indigo-600">
                                            ${window.renderIcon('plus', 'w-4 h-4')}
                                        </div>
                                        <span class="font-medium">Registrar Transacción</span>
                                    </span>
                                    ${window.renderIcon('chevron-right', 'w-5 h-5 text-slate-400')}
                                </button>
                                <button onclick="setTab('portafolio')" class="w-full flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-700 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors">
                                    <span class="flex items-center gap-3">
                                        <div class="bg-emerald-100 dark:bg-emerald-900 p-2 rounded-full text-emerald-600">
                                            ${window.renderIcon('trending-up', 'w-4 h-4')}
                                        </div>
                                        <span class="font-medium">Ver Oportunidades de Inversión</span>
                                    </span>
                                    ${window.renderIcon('chevron-right', 'w-5 h-5 text-slate-400')}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            window.renderDashboardCharts(metrics);
        };

        window.renderDashboardCharts = (metrics) => {
            window.destroyCharts(); // Destruir gráficos anteriores

            if (metrics.chartData.length === 0) return;

            const ctxBar = document.getElementById('dashboard-bar-chart').getContext('2d');
            window.state.charts.dashboardBar = new Chart(ctxBar, {
                type: 'bar',
                data: {
                    labels: metrics.chartData.map(d => d.name),
                    datasets: [{
                        label: 'Monto Gastado (MXN)',
                        data: metrics.chartData.map(d => d.value),
                        backgroundColor: metrics.chartData.map(d => d.color),
                        borderRadius: 5,
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: { callbacks: { label: (context) => window.formatCurrency(context.parsed.y) } }
                    },
                    scales: {
                        y: { beginAtZero: true, grid: { display: false }, ticks: { callback: (val) => `$${val/1000}k` } },
                        x: { grid: { display: false } }
                    }
                }
            });
        };
        
        // 3. RENDER GASTOS
        window.renderGastos = (transactions) => {
            const content = document.getElementById('main-content');
            
            content.innerHTML = `
                <div class="space-y-6">
                    <div class="flex justify-between items-center mb-6">
                        <h2 class="text-3xl font-bold">Control de Transacciones</h2>
                        <button 
                            onclick="showAddModal('expense')"
                            class="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 flex items-center gap-2 shadow-md transition-colors"
                        >
                            ${window.renderIcon('plus', 'w-4 h-4')} Nuevo Registro
                        </button>
                    </div>

                    <div class="bg-white dark:bg-slate-800 rounded-xl shadow-sm overflow-hidden border border-slate-200 dark:border-slate-700">
                        <div class="overflow-x-auto">
                            <table class="w-full text-left">
                                <thead class="bg-slate-50 dark:bg-slate-700 text-slate-500 dark:text-slate-300 text-sm uppercase">
                                    <tr>
                                        <th class="px-6 py-4 font-medium">Fecha</th>
                                        <th class="px-6 py-4 font-medium">Descripción</th>
                                        <th class="px-6 py-4 font-medium">Categoría</th>
                                        <th class="px-6 py-4 font-medium text-right">Monto</th>
                                        <th class="px-6 py-4 text-center">Acción</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-slate-100 dark:divide-slate-700">
                                    ${transactions.length > 0 ? transactions.map((t) => {
                                        const category = CATEGORIES.find(c => c.id === t.category);
                                        const isIncome = t.type === 'income';
                                        return `
                                            <tr class="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                                                <td class="px-6 py-4 text-sm text-slate-500">
                                                    ${new Date(t.date).toLocaleDateString()}
                                                </td>
                                                <td class="px-6 py-4 font-medium">${t.description}</td>
                                                <td class="px-6 py-4 text-sm">
                                                    <span class="px-2 py-1 rounded-full text-xs ${isIncome ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}">
                                                        ${category?.label || t.category}
                                                    </span>
                                                </td>
                                                <td class="px-6 py-4 text-right font-bold ${isIncome ? 'text-emerald-500' : 'text-slate-800 dark:text-slate-200'}">
                                                    ${isIncome ? '+' : '-'}${window.formatCurrency(t.amount)}
                                                </td>
                                                <td class="px-6 py-4 text-center">
                                                    <button onclick="window.deleteTransaction('${t.id}')" class="text-rose-400 hover:text-rose-600 p-1 rounded-full hover:bg-rose-50 transition-colors">
                                                        ${window.renderIcon('x', 'w-5 h-5')}
                                                    </button>
                                                </td>
                                            </tr>
                                        `;
                                    }).join('') : `
                                        <tr>
                                            <td colspan="5" class="px-6 py-12 text-center text-slate-500">
                                                No hay transacciones registradas. ¡Empieza ahora!
                                            </td>
                                        </tr>
                                    `}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            `;
            window.destroyCharts();
            lucide.createIcons();
        };

        // 4. RENDER SALUD FINANCIERA
        window.renderSalud = (metrics) => {
            const content = document.getElementById('main-content');
            const targetEmergencyMonths = 6;
            const emergencyFillWidth = Math.min((metrics.emergencyMonths / targetEmergencyMonths) * 100, 100);
            const emergencyColor = emergencyFillWidth >= 100 ? 'bg-emerald-500' : emergencyFillWidth >= 50 ? 'bg-amber-500' : 'bg-rose-500';

            content.innerHTML = `
                <div class="space-y-6">
                    <h2 class="text-3xl font-bold mb-6">Diagnóstico de Salud Financiera</h2>
                    
                    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <!-- Score Card -->
                        <div class="bg-white dark:bg-slate-800 p-8 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center text-center">
                            <div class="relative w-40 h-40 flex items-center justify-center mb-4">
                                <svg class="w-full h-full transform -rotate-90">
                                    <circle cx="80" cy="80" r="70" stroke="currentColor" stroke-width="10" fill="transparent" class="text-slate-100 dark:text-slate-700" />
                                    <circle cx="80" cy="80" r="70" stroke="currentColor" stroke-width="10" fill="transparent" stroke-dasharray="440" stroke-dashoffset="${440 - (440 * metrics.savingsRate) / 100}" class="text-indigo-600 transition-all duration-1000" />
                                </svg>
                                <div class="absolute top-0 left-0 w-full h-full flex flex-col items-center justify-center">
                                    <span class="text-3xl font-bold text-indigo-600">${metrics.savingsRate}%</span>
                                    <span class="text-xs text-slate-500">Ratio Ahorro</span>
                                </div>
                            </div>
                            <p class="mt-4 text-slate-600 dark:text-slate-300 max-w-xs">
                                ${metrics.savingsRate > 20 
                                    ? '¡Excelente! Estás ahorrando por encima del 20% recomendado. ¡Sigue así e invierte!' 
                                    : 'Tu meta debe ser ahorrar al menos el 20% de tus ingresos. Identifica gastos a reducir.'
                                }
                            </p>
                        </div>

                        <!-- Indicators -->
                        <div class="space-y-4">
                            <div class="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
                                <div class="flex justify-between items-center mb-2">
                                    <h4 class="font-semibold flex items-center gap-2">${window.renderIcon('save', 'w-5 h-5 text-emerald-500')} Fondo de Emergencia</h4>
                                    <span class="px-3 py-1 rounded-full text-xs font-bold ${emergencyColor.replace('bg-', 'text-')}" style="background-color: ${emergencyColor.replace('bg', '').trim()};">
                                        ${metrics.emergencyMonths} Meses
                                    </span>
                                </div>
                                <p class="text-sm text-slate-500 mb-3">Cobertura de gastos fijos (meta: 6 meses).</p>
                                <div class="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-2">
                                    <div class="${emergencyColor} h-2 rounded-full transition-all duration-1000" style="width: ${emergencyFillWidth}%"></div>
                                </div>
                                <div class="flex justify-between text-xs text-slate-400 mt-1">
                                    <span>0 meses</span>
                                    <span>6 meses</span>
                                </div>
                            </div>

                            <div class="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
                                <h4 class="font-semibold mb-2 flex items-center gap-2">${window.renderIcon('trending-up', 'w-5 h-5 text-indigo-500')} Libertad Financiera</h4>
                                <p class="text-sm text-slate-500">
                                    La libertad financiera se logra cuando tus ingresos pasivos superan tus gastos mensuales.
                                </p>
                                <p class="mt-3 font-bold text-lg text-slate-800 dark:text-slate-200">
                                    Meta de Ingreso Pasivo Mensual: ${window.formatCurrency(metrics.monthlyExpenses)}
                                </p>
                                <button onclick="setTab('portafolio')" class="mt-4 text-sm text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
                                    Planifica tus Inversiones ${window.renderIcon('chevron-right', 'w-4 h-4')}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            window.destroyCharts();
            lucide.createIcons();
        };

        // 5. RENDER PORTAFOLIO
        window.renderPortafolio = (metrics) => {
            const content = document.getElementById('main-content');
            
            // Initial state for Portafolio module
            window.state.portafolio = {
                selectedProfile: 'moderado',
                investAmount: 1000,
                projectionYears: 10,
                includeInflation: true,
                monthlyContribution: metrics.balance > 0 ? metrics.totalIncome - metrics.totalExpense : 0
            };

            const canInvest = metrics.balance >= 1000;
            const profile = RISK_PROFILES[window.state.portafolio.selectedProfile];
            
            content.innerHTML = `
                <div class="space-y-6">
                    <header class="mb-6">
                        <h2 class="text-3xl font-bold">Inversiones y Proyecciones</h2>
                        <p class="text-slate-500">Construye tu portafolio según tu perfil de riesgo.</p>
                    </header>
                    
                    <div class="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
                        <h3 class="text-xl font-bold mb-4 flex items-center gap-2 text-slate-800 dark:text-white">
                            ${window.renderIcon('pie-chart', 'text-indigo-500 w-5 h-5')} Constructor de Portafolio
                        </h3>
                        
                        <!-- Input and Profile Selection -->
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                            <div class="space-y-4">
                                <div class="p-4 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg border border-indigo-100 dark:border-indigo-800">
                                    <p class="text-sm text-slate-500 dark:text-slate-400">Tu Bolsa Disponible para Invertir</p>
                                    <p class="text-2xl font-bold text-slate-800 dark:text-white">${window.formatCurrency(metrics.balance)}</p>
                                    ${!canInvest ? `<p class="text-xs text-red-500 mt-1 flex items-center gap-1">${window.renderIcon('alert-circle', 'w-3 h-3')} Mínimo requerido: $1,000 MXN</p>` : ''}
                                </div>

                                <div>
                                    <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                        Monto Inicial a Invertir
                                    </label>
                                    <div class="relative">
                                        <span class="absolute left-3 top-2.5 text-slate-400">$</span>
                                        <input
                                            type="number"
                                            id="invest-amount-input"
                                            value="1000"
                                            min="1000"
                                            onchange="updatePortafolioState(this.id, this.value); renderPortafolioCharts();"
                                            class="w-full pl-8 pr-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-indigo-500 dark:bg-slate-700 dark:text-white"
                                        />
                                    </div>
                                    <p class="text-xs text-slate-500 mt-1">Mínimo $1,000.00 MXN</p>
                                </div>
                            </div>

                            <div>
                                <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                    Selecciona tu Perfil de Riesgo
                                </label>
                                <div id="profile-selector" class="grid grid-cols-3 gap-2">
                                    ${Object.entries(RISK_PROFILES).map(([key, data]) => `
                                        <button
                                            onclick="window.state.portafolio.selectedProfile = '${key}'; renderPortafolioCharts();"
                                            class="p-3 rounded-lg border text-sm font-medium transition-all ${key === 'moderado' ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-600'}"
                                            id="profile-btn-${key}"
                                        >
                                            ${data.label}
                                        </button>
                                    `).join('')}
                                </div>
                                <div id="profile-info" class="mt-4 p-3 bg-slate-50 dark:bg-slate-900 rounded-lg text-sm text-slate-600 dark:text-slate-300 border border-slate-100 dark:border-slate-700">
                                    <p class="font-semibold mb-1">Rentabilidad esperada: ~${(profile.returnRate * 100).toFixed(1)}% anual</p>
                                    <p>${profile.desc}</p>
                                </div>
                            </div>
                        </div>

                        <!-- Visualizations -->
                        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            <!-- Allocation Pie Chart & Table -->
                            <div class="flex flex-col items-center justify-center p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl">
                                <h3 class="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-4">Distribución de Activos</h3>
                                <div class="chart-container w-full max-h-80">
                                    <canvas id="portfolio-pie-chart"></canvas>
                                </div>
                                <div id="allocation-table" class="w-full mt-4">
                                    <!-- Table content injected by JS -->
                                </div>
                            </div>

                            <!-- Projections Line Chart -->
                            <div class="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl flex flex-col">
                                <div class="flex justify-between items-start mb-4">
                                    <h3 class="text-sm font-semibold text-slate-500 dark:text-slate-400">Proyección de Crecimiento</h3>
                                    <div class="flex items-center gap-2 text-xs">
                                        <input 
                                            type="checkbox" 
                                            id="inflation-checkbox"
                                            checked
                                            onchange="window.state.portafolio.includeInflation = this.checked; renderPortafolioCharts();"
                                            class="rounded text-indigo-600 focus:ring-indigo-500 dark:bg-slate-700 dark:border-slate-600"
                                        />
                                        <label for="inflation-checkbox" class="text-slate-600 dark:text-slate-300">Ajustar Inflación (3%)</label>
                                    </div>
                                </div>
                                
                                <div class="chart-container flex-1">
                                    <canvas id="projection-line-chart"></canvas>
                                </div>

                                <div class="flex justify-center gap-2 mt-4">
                                    ${[5, 10, 20].map(yr => `
                                        <button 
                                            onclick="window.state.portafolio.projectionYears = ${yr}; renderPortafolioCharts();"
                                            class="text-xs px-3 py-1 rounded-full border border-slate-200 text-slate-500 transition-colors"
                                            id="proj-btn-${yr}"
                                        >
                                            ${yr} Años
                                        </button>
                                    `).join('')}
                                </div>

                                <div class="mt-4 p-3 bg-white dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700">
                                   <p id="projection-result" class="text-xs text-slate-500 text-center">
                                     <!-- Proyeccion result injected by JS -->
                                   </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            // Call chart rendering function after DOM is ready
            setTimeout(() => window.renderPortafolioCharts(), 0);
            lucide.createIcons();
        };

        window.updatePortafolioState = (id, value) => {
            if (id === 'invest-amount-input') {
                window.state.portafolio.investAmount = Math.max(1000, Number(value));
            }
            // For monthly contribution, we use the calculated monthly savings for this demo
        };

        window.calculateProjectionData = (profile, initialAmount, monthlyContribution, years, includeInflation) => {
            const data = [];
            let currentAmount = initialAmount;
            const annualRate = profile.returnRate;
            const inflationRate = 0.03;
            // Tasa de rendimiento real (ajustada por inflación)
            const realRate = includeInflation ? (1 + annualRate) / (1 + inflationRate) - 1 : annualRate;
            const monthlyRate = realRate / 12;

            for (let year = 0; year <= years; year++) {
                // Cálculo del capital invertido total (simple suma)
                const investedTotal = initialAmount + (monthlyContribution * 12 * year);

                data.push({
                    year: year,
                    amount: Math.round(currentAmount),
                    invested: Math.round(investedTotal)
                });
                
                // Fórmula de Interés Compuesto con aportaciones periódicas:
                // FV = P * (1+r/n)^(nt) + PMT * [((1+r/n)^(nt) - 1) / (r/n)]
                // Donde P=currentAmount (monto anterior), PMT=monthlyContribution, r=annualRate/12, n=12, t=1
                
                // Calculamos el valor futuro al final del año siguiente
                const months = 12;
                const ratePerPeriod = monthlyRate;

                if (year < years) {
                    currentAmount = (currentAmount * Math.pow(1 + ratePerPeriod, months)) + 
                                    (monthlyContribution * ((Math.pow(1 + ratePerPeriod, months) - 1) / ratePerPeriod));
                }
            }
            return data;
        };

        window.renderPortafolioCharts = () => {
            window.destroyCharts(); // Destruir gráficos anteriores
            
            const pState = window.state.portafolio;
            const profile = RISK_PROFILES[pState.selectedProfile];
            const investAmount = Number(document.getElementById('invest-amount-input').value) || 1000;
            const maxYears = 20;

            // 1. Highlight selected profile button
            document.querySelectorAll('#profile-selector button').forEach(btn => {
                btn.classList.remove('bg-indigo-600', 'text-white', 'border-indigo-600', 'shadow-md');
                btn.classList.add('bg-white', 'dark:bg-slate-700', 'text-slate-600', 'dark:text-slate-300', 'border-slate-200', 'dark:border-slate-600', 'hover:bg-slate-50', 'dark:hover:bg-slate-600');
            });
            const selectedBtn = document.getElementById(`profile-btn-${pState.selectedProfile}`);
            if(selectedBtn) {
                selectedBtn.classList.add('bg-indigo-600', 'text-white', 'border-indigo-600', 'shadow-md');
                selectedBtn.classList.remove('bg-white', 'dark:bg-slate-700', 'text-slate-600', 'dark:text-slate-300', 'border-slate-200', 'dark:border-slate-600', 'hover:bg-slate-50', 'dark:hover:bg-slate-600');
            }

            // Update profile info
            const profileInfo = document.getElementById('profile-info');
            profileInfo.innerHTML = `<p class="font-semibold mb-1">Rentabilidad esperada: ~${(profile.returnRate * 100).toFixed(1)}% anual</p><p>${profile.desc}</p>`;

            // 2. Allocation Pie Chart
            const ctxPie = document.getElementById('portfolio-pie-chart').getContext('2d');
            window.state.charts.portfolioPie = new Chart(ctxPie, {
                type: 'doughnut',
                data: {
                    labels: profile.allocation.map(a => a.name),
                    datasets: [{
                        data: profile.allocation.map(a => a.value),
                        backgroundColor: profile.allocation.map(a => a.color),
                        borderWidth: 0,
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'bottom', labels: { usePointStyle: true } },
                        tooltip: { callbacks: { label: (context) => `${context.label}: ${context.parsed}%` } }
                    },
                    cutout: '70%',
                }
            });

            // 3. Allocation Table
            const allocationTable = document.getElementById('allocation-table');
            allocationTable.innerHTML = `
                <table class="w-full text-sm text-left">
                    <thead>
                        <tr class="text-slate-500 border-b dark:border-slate-700">
                            <th class="pb-2">Activo</th>
                            <th class="pb-2 text-right">%</th>
                            <th class="pb-2 text-right">Monto</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${profile.allocation.map((item) => `
                            <tr class="border-b border-slate-100 dark:border-slate-800">
                                <td class="py-2 flex items-center gap-2">
                                    <div class="w-2 h-2 rounded-full" style="background-color: ${item.color}"></div>
                                    ${item.name}
                                </td>
                                <td class="py-2 text-right">${item.value}%</td>
                                <td class="py-2 text-right font-medium">${window.formatCurrency(investAmount * (item.value / 100))}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
            
            // 4. Projection Line Chart
            const fullProjectionData = window.calculateProjectionData(
                profile, 
                investAmount, 
                pState.monthlyContribution, 
                maxYears, 
                pState.includeInflation
            );

            // Filter data based on selected years
            const filteredData = fullProjectionData.filter(d => d.year <= pState.projectionYears);

            // Highlight selected projection button
            document.querySelectorAll('[id^="proj-btn-"]').forEach(btn => {
                btn.classList.remove('bg-indigo-100', 'text-indigo-700', 'border-indigo-200');
                btn.classList.add('border-slate-200', 'text-slate-500');
            });
            const projBtn = document.getElementById(`proj-btn-${pState.projectionYears}`);
            if(projBtn) projBtn.classList.add('bg-indigo-100', 'text-indigo-700', 'border-indigo-200');


            // Update projection result
            const finalValue = filteredData.length > 0 ? filteredData[filteredData.length - 1].amount : 0;
            const projectionResult = document.getElementById('projection-result');
            projectionResult.innerHTML = `
                En ${pState.projectionYears} años podrías tener <br/>
                <span class="text-xl font-bold text-indigo-600 dark:text-indigo-400">
                   ${window.formatCurrency(finalValue)}
                </span>
                <p class="text-xs mt-1 text-slate-400">
                    (${pState.includeInflation ? 'Ajustado a inflación' : 'Sin ajuste de inflación'})
                </p>
            `;
            

            const ctxLine = document.getElementById('projection-line-chart').getContext('2d');

            const gradient = ctxLine.createLinearGradient(0, 0, 0, 350);
            gradient.addColorStop(0, 'rgba(99, 102, 241, 0.5)'); // Tailwind indigo-500 with opacity
            gradient.addColorStop(1, 'rgba(99, 102, 241, 0)');

            window.state.charts.projectionLine = new Chart(ctxLine, {
                type: 'line',
                data: {
                    labels: filteredData.map(d => `Año ${d.year}`),
                    datasets: [
                        {
                            label: 'Valor Proyectado',
                            data: filteredData.map(d => d.amount),
                            borderColor: '#6366f1',
                            backgroundColor: gradient,
                            fill: true,
                            tension: 0.4,
                            pointRadius: 3,
                        },
                         {
                            label: 'Capital Invertido',
                            data: filteredData.map(d => d.invested),
                            borderColor: '#94a3b8',
                            backgroundColor: 'transparent',
                            borderDash: [5, 5],
                            tension: 0.4,
                            pointRadius: 0,
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'top' },
                        tooltip: { 
                            callbacks: { 
                                label: (context) => `${context.dataset.label}: ${window.formatCurrency(context.parsed.y)}`,
                                title: (context) => context[0].label
                            } 
                        }
                    },
                    scales: {
                        y: { beginAtZero: true, grid: { color: 'rgba(226, 232, 240, 0.2)' }, ticks: { callback: (val) => `$${val/1000}k` } },
                        x: { grid: { display: false } }
                    }
                }
            });

        };

        // --- MODAL FUNCTIONS (Transaction) ---
        window.showAddModal = (initialType = 'expense') => {
            const modal = document.getElementById('add-transaction-modal');
            modal.classList.remove('hidden');
            modal.classList.add('flex');
            window.renderModalContent(initialType);
        };

        window.closeAddModal = () => {
            const modal = document.getElementById('add-transaction-modal');
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        };

        window.renderModalContent = (type) => {
            const modalContent = document.getElementById('modal-content');
            const categories = CATEGORIES.filter(c => c.type === type);
            const isIncome = type === 'income';

            modalContent.innerHTML = `
                <div class="flex justify-between items-center mb-6">
                    <h3 class="text-lg font-bold">Nueva Transacción</h3>
                    <button onclick="closeAddModal()" class="text-slate-400 hover:text-slate-600">${window.renderIcon('x', 'w-5 h-5')}</button>
                </div>
                
                <form id="add-transaction-form" onsubmit="window.handleAddTransaction(event)">
                    <div class="space-y-4">
                        <div class="flex gap-2 p-1 bg-slate-100 dark:bg-slate-700 rounded-lg">
                            <button 
                                type="button"
                                onclick="window.renderModalContent('income')"
                                class="flex-1 py-2 text-sm font-medium rounded-md transition-all ${isIncome ? 'bg-white dark:bg-slate-600 text-emerald-600 shadow-sm' : 'text-slate-500'}"
                            >Ingreso</button>
                            <button 
                                type="button"
                                onclick="window.renderModalContent('expense')"
                                class="flex-1 py-2 text-sm font-medium rounded-md transition-all ${!isIncome ? 'bg-white dark:bg-slate-600 text-rose-600 shadow-sm' : 'text-slate-500'}"
                            >Gasto</button>
                        </div>

                        <div>
                            <label for="trans-amount" class="block text-sm font-medium mb-1">Monto</label>
                            <input 
                                type="number" 
                                id="trans-amount"
                                name="amount"
                                required
                                class="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                                placeholder="0.00"
                                autofocus
                            />
                        </div>

                        <div>
                            <label for="trans-desc" class="block text-sm font-medium mb-1">Descripción</label>
                            <input 
                                type="text" 
                                id="trans-desc"
                                name="description"
                                required
                                class="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                                placeholder="Ej: Supermercado"
                            />
                        </div>

                        <div>
                            <label for="trans-category" class="block text-sm font-medium mb-1">Categoría</label>
                            <select 
                                id="trans-category"
                                name="category"
                                required
                                class="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                            >
                                ${categories.map(c => `<option value="${c.id}">${c.label}</option>`).join('')}
                            </select>
                        </div>
                        
                        <input type="hidden" name="type" value="${type}">

                        <button 
                            type="submit"
                            class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 rounded-lg mt-4 transition-colors shadow-md"
                        >
                            Guardar ${isIncome ? 'Ingreso' : 'Gasto'}
                        </button>
                    </div>
                </form>
            `;
            lucide.createIcons();
        };

        window.handleAddTransaction = async (event) => {
            event.preventDefault();
            if (!window.state.user) return;
            
            const form = event.target;
            const formData = new FormData(form);
            const data = Object.fromEntries(formData.entries());
            
            try {
                // Ensure amount is a number
                const amount = parseFloat(data.amount);
                if (isNaN(amount) || amount <= 0) {
                    // Show a message box instead of alert()
                    console.error("Monto inválido. Debe ser un número positivo.");
                    return;
                }

                await addDoc(collection(window.db, 'artifacts', appId, 'users', window.state.user.uid, 'transactions'), {
                    description: data.description,
                    amount: amount,
                    category: data.category,
                    type: data.type,
                    date: new Date().toISOString()
                });
                
                window.closeAddModal();
                console.log("Transacción agregada exitosamente.");
            } catch (e) {
                console.error("Error agregando documento:", e);
            }
        };
        
        // --- CHATBOT FUNCTIONS ---
        window.initChatbot = (metrics) => {
            const fab = document.getElementById('chatbot-fab');
            const modalContainer = document.getElementById('chatbot-modal');
            
            let isOpen = false;
            let messages = [{ text: "Hola, soy FinBot 🤖. ¿En qué puedo ayudarte hoy con tus finanzas?", sender: 'bot' }];
            
            const scrollToBottom = () => {
                const chatBody = document.getElementById('chat-body');
                if (chatBody) chatBody.scrollTop = chatBody.scrollHeight;
            };

            const generateBotResponse = (userInput, metrics) => {
                const lowerInput = userInput.toLowerCase();
                let botResponse = "Interesante. Para un análisis detallado, revisa la sección de Salud Financiera.";
                
                const savingsRate = metrics.savingsRate;
                const balance = metrics.balance;

                if (lowerInput.includes('hola') || lowerInput.includes('saludo')) {
                    botResponse = "¡Hola! Soy tu asistente financiero FinBot. Pregúntame sobre ahorro, inversión o tu salud financiera.";
                } else if (lowerInput.includes('invertir') || lowerInput.includes('inversión')) {
                    if (balance < 1000) {
                         botResponse = `Tu balance actual (${window.formatCurrency(balance)}) es menor al mínimo de inversión ($1,000 MXN). ¡Sigue ahorrando!`;
                    } else {
                        botResponse = `¡Felicidades! Tienes ${window.formatCurrency(balance)} disponible. Te recomiendo visitar el módulo "Inversiones" y explorar el perfil ${savingsRate > 20 ? 'Agresivo' : 'Moderado'}.`;
                    }
                } else if (lowerInput.includes('ahorro') || lowerInput.includes('salud')) {
                    if (savingsRate > 25) {
                        botResponse = `Tu ratio de ahorro es excelente (${savingsRate}%). ¡Estás en camino a la libertad financiera!`;
                    } else if (savingsRate > 10) {
                        botResponse = `Tu ratio de ahorro es de ${savingsRate}%. Es bueno, pero apunta al 20%. ¡Puedes hacerlo!`;
                    } else {
                        botResponse = `Tu ratio de ahorro es bajo (${savingsRate}%). Es urgente que identifiques y reduzcas tus gastos.`;
                    }
                } else if (lowerInput.includes('deuda')) {
                    botResponse = "Mantener deudas es costoso. Prioriza pagar las deudas con las tasas de interés más altas (tarjetas de crédito) antes de invertir.";
                } else if (lowerInput.includes('portafolio') || lowerInput.includes('riesgo')) {
                    botResponse = "Un portafolio es la mezcla de activos. Visita el módulo 'Inversiones' para ver las asignaciones por perfil (Conservador, Moderado, Agresivo).";
                }

                return botResponse;
            };

            const renderChatModal = () => {
                modalContainer.innerHTML = `
                    <div class="bg-white dark:bg-slate-800 rounded-lg shadow-2xl w-80 md:w-96 flex flex-col border border-gray-200 dark:border-slate-700 h-[500px]">
                        <div class="bg-indigo-600 text-white p-4 rounded-t-lg flex justify-between items-center">
                            <h3 class="font-bold flex items-center gap-2">${window.renderIcon('message-square', 'w-5 h-5')} FinBot</h3>
                            <button id="close-chat-btn" class="hover:text-gray-200">${window.renderIcon('x', 'w-5 h-5')}</button>
                        </div>
                        
                        <div id="chat-body" class="flex-1 p-4 overflow-y-auto bg-gray-50 dark:bg-slate-900 scrollbar-custom">
                            ${messages.map((msg, idx) => `
                                <div class="mb-3 flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}">
                                    <div class="p-3 rounded-lg max-w-[80%] text-sm shadow-sm ${
                                        msg.sender === 'user' 
                                            ? 'bg-indigo-600 text-white rounded-br-none' 
                                            : 'bg-white dark:bg-slate-700 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-slate-600 rounded-bl-none'
                                    }">
                                        ${msg.text}
                                    </div>
                                </div>
                            `).join('')}
                        </div>

                        <div class="p-3 bg-white dark:bg-slate-800 border-t border-gray-200 dark:border-slate-700 flex gap-2">
                            <input 
                                type="text" 
                                id="chat-input"
                                placeholder="Pregunta sobre finanzas..."
                                class="flex-1 border border-gray-300 dark:border-slate-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-transparent dark:text-white"
                            />
                            <button id="send-chat-btn" class="bg-indigo-600 text-white p-2 rounded-md hover:bg-indigo-700">
                                ${window.renderIcon('send', 'w-5 h-5')}
                            </button>
                        </div>
                    </div>
                `;
                lucide.createIcons();
                scrollToBottom();

                document.getElementById('close-chat-btn').onclick = toggleChat;
                document.getElementById('send-chat-btn').onclick = handleChatSend;
                document.getElementById('chat-input').addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') handleChatSend();
                });
            };

            const handleChatSend = () => {
                const inputElement = document.getElementById('chat-input');
                const inputText = inputElement.value.trim();
                if (!inputText) return;

                const userMsg = { text: inputText, sender: 'user' };
                messages = [...messages, userMsg];
                inputElement.value = '';
                renderChatModal(); // Re-render to show user message

                // Simulate bot typing and response
                setTimeout(() => {
                    const botResponseText = generateBotResponse(inputText, metrics);
                    messages = [...messages, { text: botResponseText, sender: 'bot' }];
                    renderChatModal(); // Re-render to show bot response
                }, 1200);
            };

            const toggleChat = () => {
                isOpen = !isOpen;
                if (isOpen) {
                    modalContainer.classList.remove('hidden');
                    fab.classList.add('hidden');
                    renderChatModal();
                    // Re-calculate metrics just before opening
                    const updatedMetrics = window.calculateMetrics();
                    window.initChatbot(updatedMetrics); // Re-init to pass fresh metrics
                } else {
                    modalContainer.classList.add('hidden');
                    fab.classList.remove('hidden');
                }
            };
            
            fab.onclick = toggleChat;
        };


        // --- MAIN RENDER LOOP ---
        window.renderApp = () => {
            const loader = document.getElementById('loader');
            const mainContent = document.getElementById('main-content');
            
            if (window.state.loading) {
                mainContent.innerHTML = `<div id="loader" class="flex items-center justify-center h-[80vh]"><div class="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div></div>`;
                return;
            }

            loader.remove(); // Remove loader if it was active
            
            const metrics = window.calculateMetrics();
            
            // 1. Update navigation
            window.renderNav();
            
            // 2. Update User ID
            const userIdDisplay = document.getElementById('user-id-display');
            if (userIdDisplay) userIdDisplay.textContent = window.state.user?.uid.slice(0, 10) + '...';

            // 3. Render active tab content
            switch (window.state.activeTab) {
                case 'dashboard':
                    window.renderDashboard(metrics);
                    break;
                case 'gastos':
                    window.renderGastos(window.state.transactions);
                    break;
                case 'salud':
                    window.renderSalud(metrics);
                    break;
                case 'portafolio':
                    window.renderPortafolio(metrics);
                    break;
                default:
                    window.renderDashboard(metrics);
            }
            
            // 4. Initialize Chatbot with current metrics
            window.initChatbot(metrics);
            
            lucide.createIcons(); // Rerender Lucide icons for new content
        };


        // --- ENTRY POINT ---
        window.onload = () => {
             // 1. Authentication listener
            onAuthStateChanged(window.auth, (currentUser) => {
                if (currentUser) {
                    window.state.user = currentUser;
                    if (window.state.loading) { // Fetch only on first successful auth
                        window.fetchTransactions();
                    }
                } else {
                    // Sign in anonymously if not authenticated
                    signInAnonymously(window.auth).catch(e => console.error("Error signing in anonymously:", e));
                }
            });
            
            // Ensure icons are rendered initially
            lucide.createIcons();
            
            // Initial render
            window.renderApp(); 
        };
    