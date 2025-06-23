// Updated wallet.js with proper demo mode handling

class WalletManager {
    constructor() {
        this.wallet = null;
        this.isConnected = false;
        this.publicKey = null;
        this.walletHash = null;
        console.log('🔧 WalletManager initialized');
    }

    // Check if Phantom wallet is installed
    isPhantomInstalled() {
        const hasPhantom = !!(window.solana && window.solana.isPhantom);
        console.log('🔧 Phantom installed?', hasPhantom);
        return hasPhantom;
    }

    // Connect to Phantom wallet
    async connect() {
        try {
            console.log('🔧 Connect function called');
            
            if (!this.isPhantomInstalled()) {
                const error = 'Phantom wallet is not installed. Please install it from phantom.app';
                console.log('🔧 ERROR:', error);
                throw new Error(error);
            }

            console.log('🔧 Calling window.solana.connect()...');
            const response = await window.solana.connect();
            console.log('🔧 Connect response:', response);
            
            this.wallet = window.solana;
            this.publicKey = response.publicKey.toString();
            this.walletHash = this.createWalletHash(this.publicKey);
            this.isConnected = true;

            console.log('🔧 Wallet connected successfully!');
            console.log('🔧 Public key:', this.publicKey);
            console.log('🔧 Wallet hash:', this.walletHash);

            // Update database instance
            console.log('🔧 Updating db.currentWallet...');
            db.currentWallet = this.walletHash;

            // Create or update user in database
            console.log('🔧 Creating/updating user...');
            await this.createOrUpdateUser();

            // Update UI - this will remove demo mode and show connected state
            console.log('🔧 Updating UI...');
            this.updateWalletUI();

            // Save connection state
            localStorage.setItem('wallet_connected', 'true');
            localStorage.setItem('wallet_address', this.publicKey);

            return true;

        } catch (error) {
            console.error('🔧 Connect failed:', error);
            throw error;
        }
    }

    // Disconnect wallet
    async disconnect() {
        try {
            console.log('🔧 Disconnecting wallet...');
            
            if (this.wallet) {
                await this.wallet.disconnect();
            }
            
            this.wallet = null;
            this.publicKey = null;
            this.walletHash = null;
            this.isConnected = false;

            // Reset to demo user
            db.currentWallet = 'demo_user';

            // Update UI - this will show demo mode again
            this.updateWalletUI();

            // Clear saved connection
            localStorage.removeItem('wallet_connected');
            localStorage.removeItem('wallet_address');

            console.log('🔧 Wallet disconnected successfully');

        } catch (error) {
            console.error('🔧 Disconnect error:', error);
        }
    }

    // Create a hash from wallet address for privacy
    createWalletHash(publicKey) {
        let hash = 0;
        for (let i = 0; i < publicKey.length; i++) {
            const char = publicKey.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        const result = `wallet_${Math.abs(hash).toString(36)}`;
        console.log('🔧 Created wallet hash:', result);
        return result;
    }

    // Create or update user in Supabase
    async createOrUpdateUser() {
        try {
            console.log('🔧 Creating/updating user in database...');
            
            const { data, error } = await supabase
                .from('users')
                .upsert({
                    wallet_hash: this.walletHash,
                    wallet_address: this.publicKey,
                    last_login: new Date().toISOString()
                }, {
                    onConflict: 'wallet_hash'
                })
                .select()
                .single();

            if (error) {
                console.error('🔧 Database error:', error);
                throw error;
            }

            console.log('🔧 User created/updated:', data);
            return data;

        } catch (error) {
            console.error('🔧 createOrUpdateUser failed:', error);
            return null;
        }
    }

    // Update wallet connection UI
    updateWalletUI() {
        console.log('🔧 Updating wallet UI...');
        
        const connectBtn = document.getElementById('connectWallet');
        const walletInfo = document.getElementById('walletInfo');
        const walletAddress = document.getElementById('walletAddress');
        const disconnectBtn = document.getElementById('disconnectWallet');

        console.log('🔧 UI elements found:', {
            connectBtn: !!connectBtn,
            walletInfo: !!walletInfo,
            walletAddress: !!walletAddress,
            disconnectBtn: !!disconnectBtn
        });

        if (this.isConnected) {
            // CONNECTED STATE: Show wallet info, hide connect button
            console.log('🔧 Showing connected state');
            if (connectBtn) connectBtn.style.display = 'none';
            if (walletInfo) {
                walletInfo.innerHTML = `
                    <div class="wallet-details">
                        <span class="wallet-label">Connected:</span>
                        <span class="wallet-address">${this.publicKey.slice(0, 4)}...${this.publicKey.slice(-4)}</span>
                    </div>
                    <button class="disconnect-btn" onclick="disconnectWallet()">
                        Disconnect
                    </button>
                `;
                walletInfo.style.display = 'flex';
            }
        } else {
            // DISCONNECTED STATE: Show connect button and demo mode with tooltip
            console.log('🔧 Showing disconnected state');
            if (connectBtn) connectBtn.style.display = 'block';
            if (walletInfo) {
                walletInfo.innerHTML = `
                    <div class="demo-mode-container">
                        <div class="demo-indicator">DEMO MODE</div>
                        <div class="info-tooltip">
                            <span class="info-icon">ⓘ</span>
                            <div class="tooltip-content">
                                Login with Phantom to create your profile and start tracking your active memecoin positions. Ensure to use a burner wallet for additional safety - your wallet is just the user ID.
                            </div>
                        </div>
                    </div>
                `;
                walletInfo.style.display = 'flex';
            }
        }

        // Update brand text to show connection status
        const brandText = document.querySelector('.brand-text');
        if (brandText) {
            if (this.isConnected) {
                brandText.textContent = 'DegenVault 🔗';
            } else {
                brandText.textContent = 'DegenVault';
            }
        }
    }

    // Auto-connect if previously connected
    async autoConnect() {
        console.log('🔧 Attempting auto-connect...');
        
        const wasConnected = localStorage.getItem('wallet_connected');
        const savedAddress = localStorage.getItem('wallet_address');

        console.log('🔧 Auto-connect check:', { wasConnected, savedAddress: savedAddress?.slice(0, 10) + '...' });

        if (wasConnected && savedAddress && this.isPhantomInstalled()) {
            try {
                console.log('🔧 Trying silent connect...');
                const response = await window.solana.connect({ onlyIfTrusted: true });
                
                if (response.publicKey.toString() === savedAddress) {
                    this.wallet = window.solana;
                    this.publicKey = response.publicKey.toString();
                    this.walletHash = this.createWalletHash(this.publicKey);
                    this.isConnected = true;
                    
                    db.currentWallet = this.walletHash;
                    await this.createOrUpdateUser();
                    this.updateWalletUI();
                    
                    console.log('🔧 Auto-connected successfully:', this.publicKey);
                    return true;
                }
            } catch (error) {
                console.log('🔧 Auto-connect failed:', error);
                localStorage.removeItem('wallet_connected');
                localStorage.removeItem('wallet_address');
            }
        }
        
        console.log('🔧 Auto-connect not possible, showing demo mode');
        // If auto-connect fails, show demo mode
        this.updateWalletUI();
        return false;
    }

    // Get current wallet info
    getWalletInfo() {
        return {
            isConnected: this.isConnected,
            publicKey: this.publicKey,
            walletHash: this.walletHash
        };
    }
}

// Global wallet manager instance
console.log('🔧 Creating global walletManager...');
const walletManager = new WalletManager();

// Wallet connection functions for buttons
async function connectWallet() {
    console.log('🔧 connectWallet() function called');
    
    try {
        if (typeof showStatus === 'function') {
            showStatus('Connecting to Phantom wallet...', false);
        }
        
        await walletManager.connect();
        
        if (typeof showStatus === 'function') {
            showStatus('Wallet connected successfully! 🔗', false);
        }
        
        // Reload positions for the connected wallet
        if (typeof db !== 'undefined' && typeof updateDashboard === 'function') {
            positions = await db.getPositions();
            updateDashboard();
            updateDegenBag();
        }
        
    } catch (error) {
        console.error('🔧 connectWallet error:', error);
        
        let message = 'Failed to connect wallet. Please try again.';
        if (error.message.includes('not installed')) {
            message = 'Please install Phantom wallet from phantom.app';
        } else if (error.message.includes('rejected') || error.message.includes('User rejected')) {
            message = 'Wallet connection was rejected';
        }
        
        if (typeof showStatus === 'function') {
            showStatus(message, true);
        } else {
            alert(message);
        }
    }
}

async function disconnectWallet() {
    console.log('🔧 disconnectWallet() function called');
    
    try {
        await walletManager.disconnect();
        
        if (typeof showStatus === 'function') {
            showStatus('Wallet disconnected', false);
        }
        
        // Clear positions and reload demo data
        if (typeof db !== 'undefined' && typeof updateDashboard === 'function') {
            positions = await db.getPositions();
            updateDashboard();
            updateDegenBag();
        }
        
    } catch (error) {
        console.error('🔧 disconnectWallet error:', error);
        if (typeof showStatus === 'function') {
            showStatus('Error disconnecting wallet', true);
        }
    }
}

console.log('🔧 wallet.js fully loaded');