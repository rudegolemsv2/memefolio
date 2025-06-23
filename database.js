// Supabase connection - ADD YOUR KEYS HERE
const SUPABASE_URL = 'https://ifdzrgcpbdzklqrrdfuf.supabase.co';  // ← PUT YOUR URL HERE
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlmZHpyZ2NwYmR6a2xxcnJkZnVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA2OTQzMjMsImV4cCI6MjA2NjI3MDMyM30.UTe4aVIcLtd24pgLP29x87-qPHZzZVDc1UU5rMMvaSI';  // ← PUT YOUR KEY HERE

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Complete database class
const db = {
    currentWallet: 'demo_user', // We'll fix this later with real wallet
    
    // Get all positions for current user
    async getPositions() {
        try {
            const { data, error } = await supabase
                .from('positions')
                .select('*')
                .eq('user_wallet_hash', this.currentWallet)
                .order('created_at', { ascending: false });
            
            if (error) {
                console.error('Error fetching positions:', error);
                return [];
            }
            console.log('Fetched positions:', data);
            return data || [];
        } catch (error) {
            console.error('Error in getPositions:', error);
            return [];
        }
    },

    // Add new position
    async addPosition(position) {
        try {
            console.log('Adding position to database:', position);
            
            const { data, error } = await supabase
                .from('positions')
                .insert({
                    user_wallet_hash: this.currentWallet,
                    token_address: position.address,
                    token_name: position.name,
                    token_symbol: position.symbol,
                    token_logo_uri: position.logoURI || position.image, // Add fallback for DexScreener
                    total_invested_usd: Math.round(position.totalInvestedUSD),
                    weighted_avg_entry_mcap: Math.round(position.entryMarketCap),
                    current_mcap: Math.round(position.currentMarketCap)
                })
                .select()
                .single();

            if (error) {
                console.error('Error adding position:', error);
                return null;
            }
            
            console.log('Position added successfully:', data);
            return data;
        } catch (error) {
            console.error('Error in addPosition:', error);
            return null;
        }
    },

    // Remove position
    async removePosition(id) {
        try {
            const { error } = await supabase
                .from('positions')
                .delete()
                .eq('id', id)
                .eq('user_wallet_hash', this.currentWallet);

            if (error) {
                console.error('Error removing position:', error);
                return false;
            }
            
            console.log('Position removed successfully');
            return true;
        } catch (error) {
            console.error('Error in removePosition:', error);
            return false;
        }
    },

    // Update position (for price refreshes)
    async updatePosition(id, updates) {
        try {
            const updateData = {
                ...updates,
                updated_at: new Date().toISOString()
            };

            const { data, error } = await supabase
                .from('positions')
                .update(updateData)
                .eq('id', id)
                .eq('user_wallet_hash', this.currentWallet)
                .select()
                .single();

            if (error) {
                console.error('Error updating position:', error);
                return null;
            }
            
            return data;
        } catch (error) {
            console.error('Error in updatePosition:', error);
            return null;
        }
    },

    // Calculate portfolio stats
    async calculateStats() {
        try {
            const positions = await this.getPositions();
            
            const totalInvested = positions.reduce((sum, pos) => {
                return sum + parseFloat(pos.total_invested_usd || 0);
            }, 0);
            
            const currentValue = positions.reduce((sum, pos) => {
                const invested = parseFloat(pos.total_invested_usd || 0);
                const entryMcap = pos.weighted_avg_entry_mcap;
                const currentMcap = pos.current_mcap;
                
                if (entryMcap > 0 && currentMcap) {
                    const multiplier = currentMcap / entryMcap;
                    return sum + (invested * multiplier);
                }
                return sum + invested;
            }, 0);

            const pnlPercentage = totalInvested > 0 ? ((currentValue - totalInvested) / totalInvested) * 100 : 0;

            return {
                totalPositions: positions.length,
                totalInvested,
                currentValue,
                totalPnL: currentValue - totalInvested,
                pnlPercentage
            };
        } catch (error) {
            console.error('Error calculating stats:', error);
            return {
                totalPositions: 0,
                totalInvested: 0,
                currentValue: 0,
                totalPnL: 0,
                pnlPercentage: 0
            };
        }
    },

    // Save portfolio snapshot for historical tracking
// Save portfolio snapshot for historical tracking
async savePortfolioSnapshot() {
    try {
        const stats = await this.calculateStats();
        
        const { data, error } = await supabase
            .from('portfolio_history')
            .insert({
                user_wallet_hash: this.currentWallet,
                portfolio_value: Math.round(stats.currentValue), // Round to whole number
                total_invested: Math.round(stats.totalInvested), // Round to whole number
                pnl_percentage: stats.pnlPercentage
            })
            .select()
            .single();

        if (error) {
            console.error('Error saving portfolio snapshot:', error);
            return false;
        }
        
        console.log('Portfolio snapshot saved:', stats);
        return true;
    } catch (error) {
        console.error('Error in savePortfolioSnapshot:', error);
        return false;
    }
},

    // Get historical portfolio data
    async getPortfolioHistory(period = '1D') {
        try {
            let hoursBack = 24;
            
            switch (period) {
                case '1D': hoursBack = 24; break;
                case '1W': hoursBack = 24 * 7; break;
                case '1M': hoursBack = 24 * 30; break;
                default: hoursBack = 24;
            }
            
            const timeAgo = new Date(Date.now() - (hoursBack * 60 * 60 * 1000)).toISOString();
            
            const { data, error } = await supabase
                .from('portfolio_history')
                .select('*')
                .eq('user_wallet_hash', this.currentWallet)
                .gte('timestamp', timeAgo)
                .order('timestamp', { ascending: true });

            if (error) {
                console.error('Error fetching portfolio history:', error);
                return [];
            }
            
            return data || [];
        } catch (error) {
            console.error('Error in getPortfolioHistory:', error);
            return [];
        }
    },
    async clearPortfolioHistory() {
    try {
        const { error } = await supabase
            .from('portfolio_history')
            .delete()
            .eq('user_wallet_hash', this.currentWallet);

        if (error) {
            console.error('Error clearing portfolio history:', error);
            return false;
        }
        
        console.log('Portfolio history cleared');
        return true;
    } catch (error) {
        console.error('Error in clearPortfolioHistory:', error);
        return false;
    }
}
};