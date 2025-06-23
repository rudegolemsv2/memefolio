// DexScreener API Integration for DegenVault
// Replace your jupiter-api.js file with this

class DexScreenerAPI {
    constructor() {
        this.baseURL = 'https://api.dexscreener.com/latest/dex';
        this.solPrice = 200; // Default SOL price, will be updated
        this.tokenRegistry = null; // Cache for Solana token registry
    }

    // Load Solana Token Registry
    async loadTokenRegistry() {
        if (this.tokenRegistry) return this.tokenRegistry;
        
        try {
            console.log('Loading Solana Token Registry...');
            const response = await fetch('https://raw.githubusercontent.com/solana-labs/token-list/main/src/tokens/solana.tokenlist.json');
            const data = await response.json();
            this.tokenRegistry = data.tokens.reduce((acc, token) => {
                acc[token.address] = token;
                return acc;
            }, {});
            console.log('Token Registry loaded:', Object.keys(this.tokenRegistry).length, 'tokens');
            return this.tokenRegistry;
        } catch (error) {
            console.warn('Failed to load token registry:', error);
            this.tokenRegistry = {};
            return {};
        }
    }

    // Get token logo from DexScreener and Solana Token Registry
    async getTokenLogo(tokenAddress, pairData = null) {
        // Priority 1: Check DexScreener pair info.imageUrl
        if (pairData?.info?.imageUrl) {
            return pairData.info.imageUrl;
        }

        // Priority 2: Fall back to Solana Token Registry
        const registry = await this.loadTokenRegistry();
        const token = registry[tokenAddress];
        return token?.logoURI || null;
    }

    // Get SOL price in USD
    async getSOLPrice() {
        try {
            const response = await fetch(`${this.baseURL}/tokens/So11111111111111111111111111111111111111112`);
            const data = await response.json();
            
            if (data.pairs && data.pairs.length > 0) {
                // Get the most liquid pair (highest volume)
                const mainPair = data.pairs.reduce((best, current) => 
                    (current.volume && current.volume.h24 > (best.volume?.h24 || 0)) ? current : best
                );
                
                this.solPrice = parseFloat(mainPair.priceUsd) || 200;
                console.log('SOL Price updated:', this.solPrice);
            }
            
            return this.solPrice;
        } catch (error) {
            console.warn('Failed to fetch SOL price, using default:', error);
            return this.solPrice;
        }
    }

    // Get token data from DexScreener + Solana Token Registry
    async getTokenData(tokenAddress) {
        try {
            console.log('Fetching token data from DexScreener for:', tokenAddress);
            
            const response = await fetch(`${this.baseURL}/tokens/${tokenAddress}`);
            
            if (!response.ok) {
                throw new Error(`DexScreener API returned ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            console.log('DexScreener API response:', data);
            
            if (!data.pairs || data.pairs.length === 0) {
                throw new Error('No trading pairs found for this token');
            }

            // Find the best pair (highest liquidity or volume)
            const bestPair = data.pairs.reduce((best, current) => {
                const currentScore = (current.liquidity?.usd || 0) + (current.volume?.h24 || 0);
                const bestScore = (best.liquidity?.usd || 0) + (best.volume?.h24 || 0);
                return currentScore > bestScore ? current : best;
            });

            // Extract token info
            const price = parseFloat(bestPair.priceUsd) || 0;
            const marketCap = bestPair.marketCap || (price * (bestPair.baseToken?.totalSupply || 0));
            
            // Get token metadata from DexScreener
            const tokenInfo = bestPair.baseToken;
            const name = tokenInfo?.name || `Token ${tokenAddress.slice(0, 6)}`;
            const symbol = tokenInfo?.symbol || `TK${tokenAddress.slice(-3).toUpperCase()}`;
            
            // Get logo from DexScreener pair data first, then fall back to Solana Token Registry
            const logoURI = await this.getTokenLogo(tokenAddress, bestPair);
            
            const result = {
                name: name,
                symbol: symbol,
                price: price,
                marketCap: marketCap,
                logoURI: logoURI, // From DexScreener info.imageUrl or Solana Token Registry
                // Additional useful data
                volume24h: bestPair.volume?.h24 || 0,
                liquidity: bestPair.liquidity?.usd || 0,
                priceChange24h: bestPair.priceChange?.h24 || 0,
                dexId: bestPair.dexId,
                pairAddress: bestPair.pairAddress
            };

            console.log('Processed token data with logo:', result);
            return result;

        } catch (error) {
            console.error('Error fetching token data from DexScreener:', error);
            throw new Error(`Failed to fetch token data: ${error.message}`);
        }
    }

    // Get multiple tokens at once (for batch updates)
    async getMultipleTokens(tokenAddresses) {
        try {
            const addresses = tokenAddresses.join(',');
            const response = await fetch(`${this.baseURL}/tokens/${addresses}`);
            
            if (!response.ok) {
                throw new Error(`DexScreener API returned ${response.status}`);
            }
            
            const data = await response.json();
            
            // Load token registry for logos
            await this.loadTokenRegistry();
            
            // Process each token
            const results = {};
            
            if (data.pairs) {
                // Group pairs by token address
                const pairsByToken = {};
                data.pairs.forEach(pair => {
                    const tokenAddr = pair.baseToken.address;
                    if (!pairsByToken[tokenAddr]) {
                        pairsByToken[tokenAddr] = [];
                    }
                    pairsByToken[tokenAddr].push(pair);
                });
                
                // Process each token
                for (const tokenAddr of Object.keys(pairsByToken)) {
                    const pairs = pairsByToken[tokenAddr];
                    const bestPair = pairs.reduce((best, current) => {
                        const currentScore = (current.liquidity?.usd || 0) + (current.volume?.h24 || 0);
                        const bestScore = (best.liquidity?.usd || 0) + (best.volume?.h24 || 0);
                        return currentScore > bestScore ? current : best;
                    });
                    
                    const price = parseFloat(bestPair.priceUsd) || 0;
                    const marketCap = bestPair.marketCap || 0;
                    const logoURI = await this.getTokenLogo(tokenAddr, bestPair);
                    
                    results[tokenAddr] = {
                        name: bestPair.baseToken?.name || 'Unknown',
                        symbol: bestPair.baseToken?.symbol || 'UNK',
                        price: price,
                        marketCap: marketCap,
                        logoURI: logoURI
                    };
                }
            }
            
            return results;
            
        } catch (error) {
            console.error('Error fetching multiple tokens:', error);
            throw error;
        }
    }

    // Convert SOL amount to USD
    solToUSD(solAmount) {
        return solAmount * this.solPrice;
    }

    // Convert USD to SOL
    usdToSOL(usdAmount) {
        return usdAmount / this.solPrice;
    }

    // Format price for display
    formatPrice(price) {
        if (price >= 1) {
            return `${price.toFixed(4)}`;
        } else if (price >= 0.0001) {
            return `${price.toFixed(6)}`;
        } else {
            return `${price.toExponential(2)}`;
        }
    }

    // Format market cap for display
    formatMarketCap(marketCap) {
        if (marketCap >= 1e9) {
            return `${(marketCap / 1e9).toFixed(2)}B`;
        } else if (marketCap >= 1e6) {
            return `${(marketCap / 1e6).toFixed(2)}M`;
        } else if (marketCap >= 1e3) {
            return `${(marketCap / 1e3).toFixed(2)}K`;
        } else {
            return `${marketCap.toFixed(0)}`;
        }
    }
}

// Global instance - replace jupiterAPI
const dexScreenerAPI = new DexScreenerAPI();

// Keep the old variable name for compatibility
const jupiterAPI = dexScreenerAPI;