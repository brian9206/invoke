/**
 * Next.js Instrumentation Hook
 * This file only runs on the server and is perfect for initialization tasks
 * Requires Next.js 13.2+
 */

export async function register() {
    // Only run on server (Node.js runtime)
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        const { initializeDatabase } = await import('./lib/db-init');
        const { createDefaultAdmin } = await import('./lib/create-admin');
        
        try {
            await initializeDatabase();
            
            // Create default admin user if no users exist
            await createDefaultAdmin();
        } catch (error) {
            console.error('💥 Failed to initialize database:', error);
            // Allow server to start but log the error
        }
    }
}
