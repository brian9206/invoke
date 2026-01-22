const path = require('path');
const fs = require('fs');

/**
 * Static Website Function
 * Serves static HTML, CSS, and JavaScript files
 * Uses Express.js request/response pattern
 */
module.exports = (req, res) => {
  try {
    // Parse the request path, default to index.html
    let requestPath = req.path || '/';
    
    // Remove leading slash and handle root path
    if (requestPath === '/') {
      requestPath = 'index.html';
    } else if (requestPath.startsWith('/')) {
      requestPath = requestPath.substring(1);
    }
    
    // Security: Prevent directory traversal
    if (requestPath.includes('..')) {
      return res.status(403).send('Forbidden');
    }
    
    // Construct file path
    const filePath = path.join(__dirname, 'public', requestPath);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).send('<html><body><h1>404 - Not Found</h1><p>The requested file was not found.</p></body></html>');
    }
    
    // Send file with automatic content-type detection
    res.status(200).sendFile(filePath, { 
      maxAge: 3600,
      lastModified: true 
    });
    
  } catch (error) {
    console.error('Error serving static file:', error);
    res.status(500).send('Internal Server Error');
  }
};
