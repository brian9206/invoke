# Static Website Example

Serve HTML, CSS, JavaScript, and other static assets.

## Basic HTML Page

```javascript
module.exports = function(req, res) {
    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>My Static Website</title>
        <style>
            body {
                font-family: Arial, sans-serif;
                max-width: 800px;
                margin: 50px auto;
                padding: 20px;
            }
            h1 { color: #333; }
            .card {
                border: 1px solid #ddd;
                padding: 20px;
                margin: 20px 0;
                border-radius: 5px;
            }
        </style>
    </head>
    <body>
        <h1>Welcome to My Static Website</h1>
        <div class="card">
            <h2>About</h2>
            <p>This is a static website served from an Invoke function.</p>
        </div>
        <div class="card">
            <h2>Features</h2>
            <ul>
                <li>HTML content</li>
                <li>Embedded CSS</li>
                <li>Fast delivery</li>
            </ul>
        </div>
    </body>
    </html>
    `;
    
    res.type('html').send(html);
};
```

## Multi-Page Website

```javascript
const pages = {
    '/': `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Home</title>
            <link rel="stylesheet" href="/styles.css">
        </head>
        <body>
            <nav>
                <a href="/">Home</a>
                <a href="/about">About</a>
                <a href="/contact">Contact</a>
            </nav>
            <h1>Home Page</h1>
            <p>Welcome to our website!</p>
        </body>
        </html>
    `,
    '/about': `
        <!DOCTYPE html>
        <html>
        <head>
            <title>About</title>
            <link rel="stylesheet" href="/styles.css">
        </head>
        <body>
            <nav>
                <a href="/">Home</a>
                <a href="/about">About</a>
                <a href="/contact">Contact</a>
            </nav>
            <h1>About Us</h1>
            <p>Learn more about our company.</p>
        </body>
        </html>
    `,
    '/contact': `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Contact</title>
            <link rel="stylesheet" href="/styles.css">
        </head>
        <body>
            <nav>
                <a href="/">Home</a>
                <a href="/about">About</a>
                <a href="/contact">Contact</a>
            </nav>
            <h1>Contact Us</h1>
            <form action="/submit" method="post">
                <input type="text" name="name" placeholder="Name">
                <input type="email" name="email" placeholder="Email">
                <textarea name="message" placeholder="Message"></textarea>
                <button type="submit">Send</button>
            </form>
        </body>
        </html>
    `,
    '/styles.css': `
        body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 0;
        }
        nav {
            background: #333;
            padding: 10px;
        }
        nav a {
            color: white;
            text-decoration: none;
            margin: 0 10px;
        }
        nav a:hover {
            text-decoration: underline;
        }
        h1, p, form {
            margin: 20px;
        }
        input, textarea {
            display: block;
            margin: 10px 0;
            padding: 8px;
            width: 300px;
        }
        button {
            padding: 10px 20px;
            background: #333;
            color: white;
            border: none;
            cursor: pointer;
        }
    `
};

module.exports = function(req, res) {
    const path = req.path || '/';
    
    // Handle form submission
    if (req.method === 'POST' && path === '/submit') {
        const { name, email, message } = req.body;
        console.log('Form submission:', { name, email, message });
        return res.redirect('/');
    }
    
    // Serve static content
    if (pages[path]) {
        const isCSS = path.endsWith('.css');
        res.type(isCSS ? 'css' : 'html').send(pages[path]);
    } else {
        res.status(404).type('html').send(`
            <!DOCTYPE html>
            <html>
            <head><title>404</title></head>
            <body>
                <h1>404 - Page Not Found</h1>
                <a href="/">Go Home</a>
            </body>
            </html>
        `);
    }
};
```

## With JavaScript

```javascript
module.exports = function(req, res) {
    const path = req.path;
    
    // Main HTML page
    if (path === '/' || path === '') {
        return res.type('html').send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Interactive Website</title>
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        max-width: 600px;
                        margin: 50px auto;
                        padding: 20px;
                    }
                    button {
                        padding: 10px 20px;
                        font-size: 16px;
                        cursor: pointer;
                    }
                    #result {
                        margin-top: 20px;
                        padding: 10px;
                        background: #f0f0f0;
                        border-radius: 5px;
                    }
                </style>
            </head>
            <body>
                <h1>Interactive Website</h1>
                <button onclick="fetchData()">Load Data</button>
                <div id="result"></div>
                
                <script src="/app.js"></script>
            </body>
            </html>
        `);
    }
    
    // JavaScript file
    if (path === '/app.js') {
        return res.type('js').send(`
            async function fetchData() {
                const result = document.getElementById('result');
                result.textContent = 'Loading...';
                
                try {
                    const response = await fetch('/api/data');
                    const data = await response.json();
                    result.textContent = JSON.stringify(data, null, 2);
                } catch (error) {
                    result.textContent = 'Error: ' + error.message;
                }
            }
        `);
    }
    
    // API endpoint
    if (path === '/api/data') {
        return res.json({
            message: 'Data loaded successfully',
            timestamp: new Date().toISOString(),
            random: Math.random()
        });
    }
    
    res.status(404).send('Not Found');
};
```

## Single Page Application (SPA)

```javascript
module.exports = function(req, res) {
    const path = req.path;
    
    // Serve HTML for all routes
    if (path === '/' || path.startsWith('/page/')) {
        return res.type('html').send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>SPA Example</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }
                    nav a { margin-right: 10px; cursor: pointer; color: blue; }
                    #app { margin-top: 20px; }
                </style>
            </head>
            <body>
                <nav>
                    <a onclick="navigate('/')">Home</a>
                    <a onclick="navigate('/page/1')">Page 1</a>
                    <a onclick="navigate('/page/2')">Page 2</a>
                </nav>
                <div id="app"></div>
                
                <script>
                    function render() {
                        const path = window.location.pathname;
                        const app = document.getElementById('app');
                        
                        if (path === '/') {
                            app.innerHTML = '<h1>Home</h1><p>Welcome to the SPA!</p>';
                        } else if (path.startsWith('/page/')) {
                            const pageId = path.split('/')[2];
                            app.innerHTML = \`<h1>Page \${pageId}</h1><p>Content for page \${pageId}</p>\`;
                        } else {
                            app.innerHTML = '<h1>404</h1><p>Page not found</p>';
                        }
                    }
                    
                    function navigate(path) {
                        history.pushState({}, '', path);
                        render();
                    }
                    
                    window.addEventListener('popstate', render);
                    render();
                </script>
            </body>
            </html>
        `);
    }
    
    res.status(404).send('Not Found');
};
```

## Best Practices

### Performance
- Minimize HTML/CSS/JS size
- Use compression for large responses
- Cache static assets with proper headers

### Security
- Sanitize user input
- Set appropriate Content-Type headers
- Use HTTPS in production

### SEO
- Include meta tags
- Use semantic HTML
- Provide meaningful titles

## Next Steps

- [File Serving Guide](/docs/guides/file-serving) - Advanced file serving
- [Response Object](/docs/api/response) - Response API
- [HTTP Requests Guide](/docs/guides/http-requests) - Make API calls
