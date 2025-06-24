// Global variables
let positions = [];
let currentCurrency = 'usdc';
let portfolioChart = null;
let currentChartPeriod = '1D';
let lastRefresh = 0;
let refreshInterval = 10 * 60 * 1000; // 10 minutes
let pendingRemoveId = null;

// Watch mode variables
let isWatchMode = false;
let watchedWalletAddress = null;
let watchedWalletHash = null;

// Helper function to create wallet hash
function createWalletHashFromAddress(publicKey) {
    let hash = 0;
    for (let i = 0; i < publicKey.length; i++) {
        const char = publicKey.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return `wallet_${Math.abs(hash).toString(36)}`;
}

// Watch mode functions
function enterWatchMode() {
    document.getElementById('watchModal').classList.add('active');
    document.getElementById('watchWalletInput').focus();
}

function closeWatchModal() {
    document.getElementById('watchModal').classList.remove('active');
    document.getElementById('watchWalletInput').value = '';
}

async function startWatching() {
    const walletAddress = document.getElementById('watchWalletInput').value.trim();
    
    if (!walletAddress) {
        showStatus('Please enter a wallet address', true);
        return;
    }
    
    if (walletAddress.length < 32 || walletAddress.length > 44) {
        showStatus('Invalid wallet address', true);
        return;
    }
    
    try {
        showStatus('Loading wallet positions...', false);
        
        watchedWalletAddress = walletAddress;
        watchedWalletHash = createWalletHashFromAddress(walletAddress);
        db.currentWallet = watchedWalletHash;
        
        positions = await db.getPositions();
        isWatchMode = true;
        
        updateWatchModeUI();
        updateDashboard();
        updateDegenBag();
        closeWatchModal();
        
        showStatus(`Now watching ${positions.length} positions`, false);
    } catch (error) {
        showStatus('Failed to load wallet positions', true);
    }
}

async function exitWatchMode() {
    isWatchMode = false;
    watchedWalletAddress = null;
    watchedWalletHash = null;
    
    if (typeof walletManager !== 'undefined' && walletManager.isConnected) {
        db.currentWallet = walletManager.walletHash;
    } else {
        db.currentWallet = 'demo_user';
    }
    
    updateWatchModeUI();
    positions = await db.getPositions();
    updateDashboard();
    updateDegenBag();
    showStatus('Exited watch mode', false);
}

function updateWatchModeUI() {
    const watchBtn = document.getElementById('watchModeBtn');
    const exitWatchBtn = document.getElementById('exitWatchBtn');
    const floatBtn = document.querySelector('.float-btn');
    const pageTitle = document.querySelector('#degenbag .page-title h1');
    const walletInfo = document.getElementById('walletInfo');
    
    if (isWatchMode) {
        if (watchBtn) watchBtn.style.display = 'none';
        if (exitWatchBtn) exitWatchBtn.style.display = 'block';
        if (floatBtn) floatBtn.style.display = 'none';
        if (pageTitle) pageTitle.textContent = '👀 Watching Wallet';
        
        if (walletInfo) {
            walletInfo.innerHTML = `
                <div class="watch-mode-indicator">
                    <div class="watch-label">Watching:</div>
                    <div class="watch-address">${watchedWalletAddress.slice(0, 6)}...${watchedWalletAddress.slice(-4)}</div>
                </div>
            `;
            walletInfo.style.display = 'flex';
        }
        
        document.body.classList.add('watch-mode-active');
    } else {
        if (watchBtn) watchBtn.style.display = 'block';
        if (exitWatchBtn) exitWatchBtn.style.display = 'none';
        if (floatBtn) floatBtn.style.display = 'block';
        if (pageTitle) pageTitle.textContent = '🎒 DegenBag';
        
        document.body.classList.remove('watch-mode-active');
        
        if (typeof walletManager !== 'undefined' && walletManager.updateWalletUI) {
            walletManager.updateWalletUI();
        }
    }
}

// Initialize app
document.addEventListener('DOMContentLoaded', async function() {
    console.log('App initializing...');
    
    // Initialize wallet connection first
    try {
        if (typeof walletManager !== 'undefined') {
            await walletManager.autoConnect();
        }
    } catch (error) {
        console.error('Wallet auto-connect failed:', error);
    }
    
    // Load positions from database
    positions = await db.getPositions();
    console.log('Loaded positions from database:', positions);
    
    initializeChart();
    setupInputFormatting();
    
    // Get SOL price on startup
    try {
        if (typeof jupiterAPI !== 'undefined') {
            await jupiterAPI.getSOLPrice();
            console.log('SOL price loaded:', jupiterAPI.solPrice);
        }
    } catch (error) {
        console.error('Failed to load SOL price:', error);
    }
    
    updateDashboard();
    updateDegenBag();
    
    // Auto-refresh positions every 10 minutes
    setInterval(refreshPositions, refreshInterval);
    
    // Modal event listeners
    document.getElementById('addModal').addEventListener('click', function(e) {
        if (e.target === this) closeAddModal();
    });
    
    document.getElementById('confirmModal').addEventListener('click', function(e) {
        if (e.target === this) cancelRemove();
    });
    
    document.getElementById('watchModal').addEventListener('click', function(e) {
        if (e.target === this) closeWatchModal();
    });
    
    // Enter key listeners
    ['tokenAddress', 'marketCap', 'investedAmount'].forEach(id => {
        document.getElementById(id).addEventListener('keypress', function(e) {
            if (e.key === 'Enter') addToDegenBag();
        });
    });
    
    document.getElementById('watchWalletInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') startWatching();
    });
    
    console.log('App initialization complete');
});

// Navigation functions
function showPage(pageId) {
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    
    document.getElementById(pageId).classList.add('active');
    
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    event.target.classList.add('active');
}

// Modal functions
function openAddModal() {
    document.getElementById('addModal').classList.add('active');
    document.getElementById('tokenAddress').focus();
}

function closeAddModal() {
    document.getElementById('addModal').classList.remove('active');
    clearForm();
}

function clearForm() {
    document.getElementById('tokenAddress').value = '';
    document.getElementById('marketCap').value = '';
    document.getElementById('investedAmount').value = '';
}

// Remove position functions
function removePosition(id) {
    if (isWatchMode) {
        showStatus('Cannot remove positions in watch mode', true);
        return;
    }
    pendingRemoveId = id;
    document.getElementById('confirmModal').classList.add('active');
}

function cancelRemove() {
    document.getElementById('confirmModal').classList.remove('active');
    pendingRemoveId = null;
}

async function confirmRemove() {
    document.getElementById('confirmModal').classList.remove('active');
    
    if (!pendingRemoveId) return;
    
    if (await db.removePosition(pendingRemoveId)) {
        positions = await db.getPositions();
        await db.clearPortfolioHistory();
        updateDashboard();
        updateDegenBag();
        showStatus('Position removed');
    } else {
        showStatus('Failed to remove position', true);
    }
    
    pendingRemoveId = null;
}

// Currency toggle
function setCurrency(currency) {
    currentCurrency = currency;
    
    document.querySelectorAll('.curr-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    document.querySelector(`[data-currency="${currency}"]`).classList.add('active');
    updateQuickButtons();
}

function updateQuickButtons() {
    const quickButtons = document.querySelectorAll('.quick-buttons')[1];
    
    if (currentCurrency === 'sol') {
        quickButtons.innerHTML = `
            <button type="button" class="quick-btn" onclick="setInvestedAmount(0.1)">0.1 SOL</button>
            <button type="button" class="quick-btn" onclick="setInvestedAmount(0.2)">0.2 SOL</button>
            <button type="button" class="quick-btn" onclick="setInvestedAmount(0.5)">0.5 SOL</button>
            <button type="button" class="quick-btn" onclick="setInvestedAmount(1)">1 SOL</button>
            <button type="button" class="quick-btn" onclick="setInvestedAmount(3)">3 SOL</button>
        `;
    } else {
        quickButtons.innerHTML = `
            <button type="button" class="quick-btn" onclick="setInvestedAmount(20)">$20</button>
            <button type="button" class="quick-btn" onclick="setInvestedAmount(50)">$50</button>
            <button type="button" class="quick-btn" onclick="setInvestedAmount(100)">$100</button>
            <button type="button" class="quick-btn" onclick="setInvestedAmount(200)">$200</button>
            <button type="button" class="quick-btn" onclick="setInvestedAmount(1000)">$1K</button>
        `;
    }
}

// Status messages
function showStatus(message, isError = false) {
    const status = document.getElementById('status');
    status.textContent = message;
    status.className = `status-msg ${isError ? 'error' : ''}`;
    status.classList.add('show');
    setTimeout(() => status.classList.remove('show'), 3000);
}

// Utility functions
function formatCurrency(num, showCents = true) {
    if (showCents) {
        return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    } else {
        return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    }
}

function parseNumberInput(value) {
    return parseFloat(value.replace(/[$,]/g, '')) || 0;
}

function formatNumberInput(value) {
    const num = parseFloat(value);
    if (isNaN(num)) return '';
    return '$' + num.toLocaleString('en-US');
}

function parseInvestedAmount(value) {
    if (currentCurrency === 'sol') {
        return parseFloat(value.replace(/[^\d.]/g, '')) || 0;
    } else {
        return parseNumberInput(value);
    }
}

function setMarketCap(amount) {
    const input = document.getElementById('marketCap');
    input.value = formatNumberInput(amount);
    input.focus();
}

function setInvestedAmount(amount) {
    const input = document.getElementById('investedAmount');
    if (currentCurrency === 'sol') {
        input.value = amount + ' SOL';
    } else {
        input.value = formatNumberInput(amount);
    }
    input.focus();
}

// Input formatting
function setupInputFormatting() {
    const marketCapInput = document.getElementById('marketCap');
    const investedAmountInput = document.getElementById('investedAmount');
    
    marketCapInput.addEventListener('input', function(e) {
        const value = e.target.value.replace(/[$,]/g, '');
        if (!isNaN(value) && value !== '') {
            e.target.value = formatNumberInput(value);
        }
    });
    
    investedAmountInput.addEventListener('input', function(e) {
        if (currentCurrency === 'sol') {
            const value = e.target.value.replace(/[^\d.]/g, '');
            if (!isNaN(value) && value !== '') {
                e.target.value = value + ' SOL';
            }
        } else {
            const value = e.target.value.replace(/[$,]/g, '');
            if (!isNaN(value) && value !== '') {
                e.target.value = formatNumberInput(value);
            }
        }
    });
}

// Chart functions
function initializeChart() {
    const ctx = document.getElementById('portfolioChart').getContext('2d');
    portfolioChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['9:00', '10:00', '11:00', '12:00', '1:00', '2:00', '3:00', '4:00'],
            datasets: [{
                label: 'Portfolio P&L',
                data: [0, 0, 0, 0, 0, 0, 0, 0],
                borderColor: '#4ecdc4',
                backgroundColor: 'rgba(78, 205, 196, 0.1)',
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointRadius: 0,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: {
                    display: true,
                    grid: { color: 'rgba(255, 255, 255, 0.1)' },
                    ticks: { color: 'rgba(255, 255, 255, 0.7)' }
                },
                y: {
                    display: true,
                    grid: { color: 'rgba(255, 255, 255, 0.1)' },
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.7)',
                        callback: function(value) {
                            if (Math.abs(value) >= 1000000) {
                                return (value >= 0 ? '+$' : '-$') + Math.abs(value / 1000000).toFixed(1) + 'M';
                            } else if (Math.abs(value) >= 1000) {
                                return (value >= 0 ? '+$' : '-$') + Math.abs(value / 1000).toFixed(1) + 'K';
                            } else {
                                return (value >= 0 ? '+$' : '-$') + Math.abs(value).toFixed(2);
                            }
                        }
                    }
                }
            }
        }
    });
}

async function setChartPeriod(period) {
    currentChartPeriod = period;
    
    document.querySelectorAll('.time-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    event.target.classList.add('active');
    
    const stats = calculateCurrentPortfolioValue();
    const pnl = stats.currentValue - stats.totalInvested;
    await updateChart(pnl);
}

function calculateCurrentPortfolioValue() {
    if (positions.length === 0) return { currentValue: 0, totalInvested: 0 };
    
    const totalInvested = positions.reduce((total, position) => {
        return total + parseFloat(position.total_invested_usd || 0);
    }, 0);
    
    const currentValue = positions.reduce((total, position) => {
        const invested = parseFloat(position.total_invested_usd || 0);
        const entryMcap = position.weighted_avg_entry_mcap || position.entry_market_cap;
        const currentMcap = position.current_mcap;
        
        if (entryMcap > 0 && currentMcap) {
            const multiplier = currentMcap / entryMcap;
            return total + (invested * multiplier);
        }
        return total + invested;
    }, 0);
    
    return { currentValue, totalInvested };
}

// Position management
async function addToDegenBag() {
    if (isWatchMode) {
        showStatus('Cannot add positions in watch mode', true);
        return;
    }
    
    const addressInput = document.getElementById('tokenAddress');
    const marketCapInput = document.getElementById('marketCap');
    const amountInput = document.getElementById('investedAmount');
    
    const address = addressInput.value.trim();
    const entryMarketCap = parseNumberInput(marketCapInput.value);
    const investedAmount = parseInvestedAmount(amountInput.value);
    
    if (!address) {
        showStatus('Please enter a token address', true);
        return;
    }
    
    if (!entryMarketCap || entryMarketCap <= 0) {
        showStatus('Please enter the market cap at purchase', true);
        return;
    }
    
    if (!investedAmount || investedAmount <= 0) {
        showStatus('Please enter the amount invested', true);
        return;
    }
    
    try {
        showStatus('Fetching token data...', false);
        
        const tokenData = await jupiterAPI.getTokenData(address);
        const totalInvestedUSD = currentCurrency === 'sol' 
            ? jupiterAPI.solToUSD(investedAmount) 
            : investedAmount;
        
        const newPosition = {
            address,
            name: tokenData.name,
            symbol: tokenData.symbol,
            logoURI: tokenData.logoURI,
            entryMarketCap,
            currentMarketCap: tokenData.marketCap,
            currentPrice: tokenData.price,
            totalInvestedUSD
        };
        
        const savedPosition = await db.addPosition(newPosition);
        if (savedPosition) {
            positions = await db.getPositions();
            showStatus('Added to DegenBag! 🎒');
            closeAddModal();
            updateDashboard();
            updateDegenBag();
        } else {
            throw new Error('Failed to save position');
        }
        
    } catch (error) {
        console.error('Error adding position:', error);
        showStatus(`Failed to fetch token data: ${error.message}`, true);
    }
}

async function refreshPositions() {
    if (positions.length === 0) return;
    
    try {
        showStatus('Refreshing positions...', false);
        
        await jupiterAPI.getSOLPrice();
        
        for (let i = 0; i < positions.length; i++) {
            try {
                const tokenData = await jupiterAPI.getTokenData(positions[i].token_address);
                
                await db.updatePosition(positions[i].id, {
                    current_mcap: tokenData.marketCap
                });
                
            } catch (error) {
                console.warn(`Failed to update ${positions[i].token_symbol}:`, error);
            }
        }
        
        positions = await db.getPositions();
        updateDashboard();
        updateDegenBag();
        showStatus('Positions updated! 📊', false);
        
    } catch (error) {
        console.error('Failed to refresh positions:', error);
        showStatus('Failed to refresh positions', true);
    }
}

// UI Update functions
function updateDashboard() {
    updatePortfolioValue();
    updateIndexCards();
}

function updatePortfolioValue() {
    if (positions.length === 0) {
        document.getElementById('totalValue').textContent = '$0.00';
        document.getElementById('totalChange').textContent = '+0.00%';
        document.getElementById('totalChange').className = 'value-change';
        updateChart(0);
        return;
    }
    
    const totalInvested = positions.reduce((total, position) => {
        return total + parseFloat(position.total_invested_usd || 0);
    }, 0);
    
    const currentValue = positions.reduce((total, position) => {
        const invested = parseFloat(position.total_invested_usd || 0);
        const entryMcap = position.weighted_avg_entry_mcap || position.entry_market_cap;
        const currentMcap = position.current_mcap;
        
        if (entryMcap > 0 && currentMcap) {
            const multiplier = currentMcap / entryMcap;
            return total + (invested * multiplier);
        }
        return total + invested;
    }, 0);
    
    const totalChange = totalInvested > 0 ? ((currentValue - totalInvested) / totalInvested) * 100 : 0;
    const pnl = currentValue - totalInvested;
    
    document.getElementById('totalValue').textContent = formatCurrency(currentValue);
    document.getElementById('totalChange').textContent = 
        `${totalChange >= 0 ? '+' : ''}${totalChange.toFixed(2)}%`;
    
    const changeElement = document.getElementById('totalChange');
    changeElement.className = 'value-change';
    if (totalChange >= 0) {
        changeElement.classList.add('positive');
    } else {
        changeElement.classList.add('negative');
    }
    
    updateChart(pnl);
}

async function updateChart(currentPnL) {
    if (!portfolioChart) return;
    
    try {
        const historyData = await db.getPortfolioHistory(currentChartPeriod);
        
        let labels = [];
        let dataPoints = [];
        
        if (historyData && historyData.length > 0) {
            historyData.forEach(record => {
                const date = new Date(record.timestamp);
                let label = '';
                
                if (currentChartPeriod === '1D') {
                    label = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
                } else if (currentChartPeriod === '1W') {
                    label = date.toLocaleDateString('en-US', { weekday: 'short' });
                } else {
                    label = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                }
                
                labels.push(label);
                const pnl = parseFloat(record.portfolio_value) - parseFloat(record.total_invested);
                dataPoints.push(pnl);
            });
            
            labels.push('Now');
            dataPoints.push(currentPnL);
            
        } else {
            if (currentChartPeriod === '1D') {
                labels = ['9:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', 'Now'];
            } else if (currentChartPeriod === '1W') {
                labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Today'];
            } else {
                labels = ['Week 1', 'Week 2', 'Week 3', 'This Week'];
            }
            
            dataPoints = new Array(labels.length).fill(currentPnL);
        }
        
        portfolioChart.data.labels = labels;
        portfolioChart.data.datasets[0].data = dataPoints;
        portfolioChart.update('none');
        
    } catch (error) {
        console.error('Error updating chart:', error);
        portfolioChart.data.datasets[0].data = new Array(8).fill(currentPnL);
        portfolioChart.update('none');
    }
}

function updateIndexCards() {
    document.getElementById('runnersCount').textContent = '0';
    document.getElementById('heatingCount').textContent = '0';
    document.getElementById('smallCount').textContent = '0';
    document.getElementById('deadCount').textContent = '0';
    
    const categories = { runners: 0, heating: 0, small: 0, dead: 0 };
    
    positions.forEach(position => {
        const marketCap = position.current_mcap || position.currentMarketCap;
        if (marketCap >= 1000000) categories.runners++;
        else if (marketCap >= 100000) categories.heating++;
        else if (marketCap >= 10000) categories.small++;
        else categories.dead++;
    });
    
    document.getElementById('runnersCount').textContent = categories.runners;
    document.getElementById('heatingCount').textContent = categories.heating;
    document.getElementById('smallCount').textContent = categories.small;
    document.getElementById('deadCount').textContent = categories.dead;
}

function updateDegenBag() {
    const container = document.getElementById('positionsContainer');
    
    if (positions.length === 0) {
        const emptyMessage = isWatchMode 
            ? '<h3>This wallet has no tracked positions</h3><p>This user hasn\'t added any positions to DegenVault yet 👀</p>'
            : '<h3>Your DegenBag is empty</h3><p>Use the + button to add your first position! 🚀</p>';
            
        container.innerHTML = `<div class="empty-state">${emptyMessage}</div>`;
        return;
    }
    
    const positionsHtml = positions.map(position => {
        const entryMcap = position.weighted_avg_entry_mcap || 1;
        const currentMcap = position.current_mcap || entryMcap;
        const invested = parseFloat(position.total_invested_usd || 0);
        
        const pnlPercent = ((currentMcap - entryMcap) / entryMcap) * 100;
        const currentValue = invested * (currentMcap / entryMcap);
        const pnlUSD = currentValue - invested;
        
        const removeButton = isWatchMode 
            ? '<div class="watch-only-badge">👀 Read Only</div>'
            : `<button class="remove-btn" onclick="removePosition('${position.id}')">Remove</button>`;
        
        return `
            <div class="position-card ${isWatchMode ? 'watch-mode' : ''}">
                <div class="position-header">
                    <div class="position-info-header">
                        ${position.token_logo_uri ? `<img src="${position.token_logo_uri}" alt="${position.token_symbol}" class="token-logo">` : '<div class="token-placeholder">🪙</div>'}
                        <div class="token-details">
                            <div class="position-name">${position.token_name || 'Unknown Token'}</div>
                            <div class="position-symbol">${position.token_symbol || 'N/A'}</div>
                            <div class="token-address" onclick="${isWatchMode ? '' : `copyAddress('${position.token_address}')`}" ${isWatchMode ? '' : 'title="Click to copy address"'}>
                                ${position.token_address.slice(0, 6)}...${position.token_address.slice(-4)}
                                ${isWatchMode ? '' : '<span class="copy-icon">📋</span>'}
                            </div>
                        </div>
                    </div>
                    ${removeButton}
                </div>
                
                <div class="position-info">
                    <div class="info-item">
                        <div class="info-label">Entry Market Cap</div>
                        <div class="info-value">${formatCurrency(entryMcap, false)}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Current Market Cap</div>
                        <div class="info-value">${formatCurrency(currentMcap, false)}</div>
                    </div>
                </div>
                
                <div class="position-pnl">
                    <div class="pnl-row">
                        <div class="pnl-label">Performance</div>
                        <div class="pnl-value ${pnlPercent >= 0 ? 'positive' : 'negative'}">
                            ${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}%
                        </div>
                    </div>
                    <div class="pnl-row">
                        <div class="pnl-label">P&L</div>
                        <div class="pnl-value ${pnlUSD >= 0 ? 'positive' : 'negative'}">
                            ${pnlUSD >= 0 ? '+' : ''}${formatCurrency(pnlUSD)}
                        </div>
                    </div>
                </div>
                
                <div style="margin-top: 12px; padding: 8px; background: rgba(0,0,0,0.2); border-radius: 6px; text-align: center; font-size: 0.85rem;">
                    💰 ${formatCurrency(invested)} invested → ${formatCurrency(currentValue)}
                </div>
            </div>
        `;
    }).join('');
    
    container.innerHTML = positionsHtml;
}

// Copy address function
function copyAddress(address) {
    navigator.clipboard.writeText(address).then(() => {
        showStatus('Address copied to clipboard! 📋');
    }).catch(() => {
        const textArea = document.createElement('textarea');
        textArea.value = address;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        showStatus('Address copied to clipboard! 📋');
    });
}
