// Global variables
let positions = [];
let currentCurrency = 'usdc';
let portfolioChart = null;
let currentChartPeriod = '1D';
let lastRefresh = 0;
let refreshInterval = 10 * 60 * 1000; // 10 minutes
let pendingRemoveId = null;

// Initialize app
// Updated initialization section for script.js
// Replace your existing DOMContentLoaded function with this:

// Initialize app
document.addEventListener('DOMContentLoaded', async function() {
    
    // Initialize wallet connection first
    try {
        const autoConnected = await walletManager.autoConnect();
        
        if (!autoConnected) {
            // Show demo indicator if not connected
            showDemoMode();
        }
    } catch (error) {
        console.error('Wallet auto-connect failed:', error);
        showDemoMode();
    }
    
    // Load positions from database (will use current wallet or demo_user)
    positions = await db.getPositions();
    
    initializeChart();
    setupInputFormatting();
    
    // Get SOL price on startup
    try {
        await jupiterAPI.getSOLPrice();
    } catch (error) {
        console.error('Failed to load SOL price:', error);
    }
    
    updateDashboard();
    updateDegenBag();
    
    // Auto-refresh positions every 10 minutes
    setInterval(refreshPositions, refreshInterval);
    
    // Close modal when clicking outside
    document.getElementById('addModal').addEventListener('click', function(e) {
        if (e.target === this) {
            closeAddModal();
        }
    });
    
    // Close confirm modal when clicking outside
    document.getElementById('confirmModal').addEventListener('click', function(e) {
        if (e.target === this) {
            cancelRemove();
        }
    });
    
    // Add enter key listeners for modal inputs
    ['tokenAddress', 'marketCap', 'investedAmount'].forEach(id => {
        document.getElementById(id).addEventListener('keypress', function(e) {
            if (e.key === 'Enter') addToDegenBag();
        });
    });
    
});

// Function to show demo mode indicator
function showDemoMode() {
    const walletInfo = document.getElementById('walletInfo');
    if (walletInfo) {
        walletInfo.innerHTML = '<div class="demo-indicator">Demo Mode</div>';
        walletInfo.style.display = 'flex';
    }
}

// Updated navigation function to handle wallet state
function showPage(pageId) {
    // Hide all pages
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    
    // Show selected page
    document.getElementById(pageId).classList.add('active');
    
    // Update nav buttons
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    event.target.classList.add('active');
    
    // If switching to degenbag and wallet not connected, show hint
    if (pageId === 'degenbag' && !walletManager.isConnected) {
        setTimeout(() => {
            showStatus('💡 Connect your Phantom wallet to save positions permanently', false);
        }, 1000);
    }
}

// Navigation functions
function showPage(pageId) {
    // Hide all pages
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    
    // Show selected page
    document.getElementById(pageId).classList.add('active');
    
    // Update nav buttons
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
    // Store the ID and show custom modal
    pendingRemoveId = id;
    document.getElementById('confirmModal').classList.add('active');
}

function cancelRemove() {
    // Close modal and reset
    document.getElementById('confirmModal').classList.remove('active');
    pendingRemoveId = null;
}

async function confirmRemove() {
    // Close modal
    document.getElementById('confirmModal').classList.remove('active');
    
    if (!pendingRemoveId) return;
    
    // Proceed with actual removal
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

// Currency toggle with quick button updates
function setCurrency(currency) {
    currentCurrency = currency;
    
    document.querySelectorAll('.curr-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    document.querySelector(`[data-currency="${currency}"]`).classList.add('active');
    
    // Update quick buttons
    updateQuickButtons();
}

function updateQuickButtons() {
    const quickButtons = document.querySelectorAll('.quick-buttons')[1]; // Second set (amount invested)
    
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

// Utility functions for number formatting
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

// Quick selection functions
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
    
    // Format market cap input
    marketCapInput.addEventListener('input', function(e) {
        const value = e.target.value.replace(/[$,]/g, '');
        if (!isNaN(value) && value !== '') {
            e.target.value = formatNumberInput(value);
        }
    });
    
    // Format invested amount input based on currency
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
                legend: {
                    display: false
                }
            },
            scales: {
                x: {
                    display: true,
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.7)'
                    }
                },
                y: {
                    display: true,
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.7)',
                        callback: function(value) {
                            // Format P&L values (can be negative)
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
        
    // Calculate current P&L and update chart
    const stats = calculateCurrentPortfolioValue();
    const pnl = stats.currentValue - stats.totalInvested;
    await updateChart(pnl);
}

// Helper function to calculate current portfolio value
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
    const addressInput = document.getElementById('tokenAddress');
    const marketCapInput = document.getElementById('marketCap');
    const amountInput = document.getElementById('investedAmount');
    
    const address = addressInput.value.trim();
    const entryMarketCap = parseNumberInput(marketCapInput.value);
    const investedAmount = parseInvestedAmount(amountInput.value);
    
    
    // Validation
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
        showStatus('Fetching token data from Jupiter...', false);
        
        // Fetch token data from Jupiter
        const tokenData = await jupiterAPI.getTokenData(address);
        
        // Convert SOL to USD if needed
        const totalInvestedUSD = currentCurrency === 'sol' 
            ? jupiterAPI.solToUSD(investedAmount) 
            : investedAmount;
        
        
        // Create new position with real data
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
        
        
        // Add to database
        const savedPosition = await db.addPosition(newPosition);
        if (savedPosition) {
            positions = await db.getPositions(); // Reload from database
            showStatus('Added to DegenBag! 🎒');
            closeAddModal();
            updateDashboard();
            updateDegenBag();
        } else {
            throw new Error('Failed to save position to database');
        }
        
    } catch (error) {
        console.error('Error adding position:', error);
        showStatus(`Failed to fetch token data: ${error.message}`, true);
    }
}

// Auto-refresh positions with current market data
async function refreshPositions() {
    if (positions.length === 0) return;
    
    try {
        showStatus('Refreshing positions...', false);
        
        // Update SOL price
        await jupiterAPI.getSOLPrice();
        
        // Update each position
        for (let i = 0; i < positions.length; i++) {
            try {
                const tokenData = await jupiterAPI.getTokenData(positions[i].token_address);
                
                // Update position in database
                await db.updatePosition(positions[i].id, {
                    current_mcap: tokenData.marketCap
                });
                
            } catch (error) {
                console.warn(`Failed to update ${positions[i].token_symbol}:`, error);
            }
        }
        
        // Reload positions from database
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
    
    // Debug: Log positions count
}

function updatePortfolioValue() {

    
    if (positions.length === 0) {
        document.getElementById('totalValue').textContent = '$0.00';
        document.getElementById('totalChange').textContent = '+0.00%';
        document.getElementById('totalChange').className = 'value-change';
        
        // Update chart with zeros
        updateChart(0);
        return;
    }
    
    // Use Supabase field names: total_invested_usd, weighted_avg_entry_mcap, current_mcap
    const totalInvested = positions.reduce((total, position) => {
        return total + parseFloat(position.total_invested_usd || 0);
    }, 0);
    
    // Calculate total current value based on market cap changes
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
    
    // Fix the class name assignment
    const changeElement = document.getElementById('totalChange');
    changeElement.className = 'value-change';
    if (totalChange >= 0) {
        changeElement.classList.add('positive');
    } else {
        changeElement.classList.add('negative');
    }
    
    // Update chart with P&L instead of total value
    updateChart(pnl);
}

// Function to update chart with real historical P&L data
async function updateChart(currentPnL) {
    if (!portfolioChart) return;
    
    try {
        
        // Get historical data for current period
        const historyData = await db.getPortfolioHistory(currentChartPeriod);
        
        let labels = [];
        let dataPoints = [];
        
        if (historyData && historyData.length > 0) {
            // Use real historical data - calculate P&L from each snapshot
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
                // Calculate P&L: portfolio_value - total_invested
                const pnl = parseFloat(record.portfolio_value) - parseFloat(record.total_invested);
                dataPoints.push(pnl);
            });
            
            // Add current P&L as the latest point
            labels.push('Now');
            dataPoints.push(currentPnL);
            
        } else {
            // No historical data yet, show flat line with current P&L
            
            if (currentChartPeriod === '1D') {
                labels = ['9:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', 'Now'];
            } else if (currentChartPeriod === '1W') {
                labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Today'];
            } else {
                labels = ['Week 1', 'Week 2', 'Week 3', 'This Week'];
            }
            
            // Fill with current P&L
            dataPoints = new Array(labels.length).fill(currentPnL);
        }
        
        portfolioChart.data.labels = labels;
        portfolioChart.data.datasets[0].data = dataPoints;
        portfolioChart.update('none');
        
        
    } catch (error) {
        console.error('Error updating chart:', error);
        // Fallback to simple display
        portfolioChart.data.datasets[0].data = new Array(8).fill(currentPnL);
        portfolioChart.update('none');
    }
}

function updateIndexCards() {
    // Reset all counts
    document.getElementById('runnersCount').textContent = '0';
    document.getElementById('heatingCount').textContent = '0';
    document.getElementById('smallCount').textContent = '0';
    document.getElementById('deadCount').textContent = '0';
    
    // Count positions by category
    const categories = { runners: 0, heating: 0, small: 0, dead: 0 };
    
    positions.forEach(position => {
        const marketCap = position.current_mcap || position.currentMarketCap;
        if (marketCap >= 1000000) categories.runners++;
        else if (marketCap >= 100000) categories.heating++;
        else if (marketCap >= 10000) categories.small++;
        else categories.dead++;
    });
    
    // Update counts
    document.getElementById('runnersCount').textContent = categories.runners;
    document.getElementById('heatingCount').textContent = categories.heating;
    document.getElementById('smallCount').textContent = categories.small;
    document.getElementById('deadCount').textContent = categories.dead;
}

function updateDegenBag() {
    const container = document.getElementById('positionsContainer');
    
    if (positions.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <h3>Your DegenBag is empty</h3>
                <p>Use the + button to add your first position! 🚀</p>
            </div>
        `;
        return;
    }
    
    const positionsHtml = positions.map(position => {
        // Use Supabase field names
        const entryMcap = position.weighted_avg_entry_mcap || 1;
        const currentMcap = position.current_mcap || entryMcap;
        const invested = parseFloat(position.total_invested_usd || 0);
        
        const pnlPercent = ((currentMcap - entryMcap) / entryMcap) * 100;
        const currentValue = invested * (currentMcap / entryMcap);
        const pnlUSD = currentValue - invested;
        
        return `
            <div class="position-card">
                <div class="position-header">
                    <div class="position-info-header">
                        ${position.token_logo_uri ? `<img src="${position.token_logo_uri}" alt="${position.token_symbol}" class="token-logo">` : '<div class="token-placeholder">🪙</div>'}
                        <div class="token-details">
                            <div class="position-name">${position.token_name || 'Unknown Token'}</div>
                            <div class="position-symbol">${position.token_symbol || 'N/A'}</div>
                            <div class="token-address" onclick="copyAddress('${position.token_address}')" title="Click to copy address">
                                ${position.token_address.slice(0, 6)}...${position.token_address.slice(-4)}
                                <span class="copy-icon">📋</span>
                            </div>
                        </div>
                    </div>
                    <button class="remove-btn" onclick="removePosition('${position.id}')">Remove</button>
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
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = address;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        showStatus('Address copied to clipboard! 📋');
    });
}

// Debug function - can be called from console
async function testAddPosition() {
    const testPosition = {
        address: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
        name: 'Jupiter',
        symbol: 'JUP',
        logoURI: null,
        entryMarketCap: 1000000,
        currentMarketCap: 1500000,
        currentPrice: 0.5,
        totalInvestedUSD: 100
    };
    
    const savedPosition = await db.addPosition(testPosition);
    
    if (savedPosition) {
        positions = await db.getPositions();
        updateDashboard();
        updateDegenBag();
        showStatus('Test position added! 🎯');
    } else {
        console.error('Failed to add test position');
        showStatus('Failed to add test position', true);
    }
}