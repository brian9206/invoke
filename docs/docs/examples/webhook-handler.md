# Webhook Handler Example

Process incoming webhooks from external services.

## Basic Webhook Handler

```javascript
module.exports = async function(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    const webhook = {
        timestamp: new Date().toISOString(),
        headers: req.headers,
        body: req.body,
        source: req.get('user-agent')
    };
    
    console.log('Webhook received:', webhook);
    
    // Process webhook data
    const { event, data } = req.body;
    
    // Respond quickly
    res.status(200).json({
        success: true,
        message: 'Webhook received',
        eventId: crypto.randomUUID()
    });
};
```

## GitHub Webhook

```javascript
const crypto = require('crypto');

function verifyGitHubSignature(payload, signature, secret) {
    const hmac = crypto.createHmac('sha256', secret);
    const digest = 'sha256=' + hmac.update(payload).digest('hex');
    
    return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(digest)
    );
}

module.exports = async function(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    const signature = req.get('x-hub-signature-256');
    const event = req.get('x-github-event');
    const deliveryId = req.get('x-github-delivery');
    
    // Verify signature (get secret from environment)
    const secret = process.env.GITHUB_WEBHOOK_SECRET;
    if (secret && signature) {
        const payload = JSON.stringify(req.body);
        const isValid = verifyGitHubSignature(payload, signature, secret);
        
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid signature' });
        }
    }
    
    console.log('GitHub webhook:', { event, deliveryId });
    
    // Handle different event types
    switch (event) {
        case 'push':
            await handlePush(req.body);
            break;
            
        case 'pull_request':
            await handlePullRequest(req.body);
            break;
            
        case 'issues':
            await handleIssue(req.body);
            break;
            
        default:
            console.log('Unhandled event:', event);
    }
    
    res.status(200).json({ success: true });
};

async function handlePush(data) {
    const { ref, commits, repository } = data;
    console.log(`Push to ${repository.name} on ${ref}: ${commits.length} commits`);
    
    // Store in KV for processing
    await kv.set(`webhook:push:${Date.now()}`, {
        repository: repository.name,
        branch: ref,
        commitCount: commits.length,
        timestamp: Date.now()
    }, 3600);
}

async function handlePullRequest(data) {
    const { action, pull_request } = data;
    console.log(`PR ${action}: #${pull_request.number} - ${pull_request.title}`);
}

async function handleIssue(data) {
    const { action, issue } = data;
    console.log(`Issue ${action}: #${issue.number} - ${issue.title}`);
}
```

## Stripe Webhook

```javascript
const crypto = require('crypto');

function verifyStripeSignature(payload, signature, secret) {
    const parts = signature.split(',');
    const timestamp = parts[0].split('=')[1];
    const sig = parts[1].split('=')[1];
    
    const signedPayload = `${timestamp}.${payload}`;
    const expectedSig = crypto.createHmac('sha256', secret)
        .update(signedPayload)
        .digest('hex');
    
    return crypto.timingSafeEqual(
        Buffer.from(sig),
        Buffer.from(expectedSig)
    );
}

module.exports = async function(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    const signature = req.get('stripe-signature');
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    
    // Verify signature
    if (secret && signature) {
        const payload = JSON.stringify(req.body);
        const isValid = verifyStripeSignature(payload, signature, secret);
        
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid signature' });
        }
    }
    
    const event = req.body;
    
    console.log('Stripe webhook:', event.type);
    
    // Handle event types
    switch (event.type) {
        case 'payment_intent.succeeded':
            await handlePaymentSuccess(event.data.object);
            break;
            
        case 'payment_intent.failed':
            await handlePaymentFailure(event.data.object);
            break;
            
        case 'customer.subscription.created':
            await handleSubscriptionCreated(event.data.object);
            break;
            
        case 'customer.subscription.deleted':
            await handleSubscriptionCancelled(event.data.object);
            break;
            
        default:
            console.log('Unhandled event type:', event.type);
    }
    
    res.status(200).json({ received: true });
};

async function handlePaymentSuccess(paymentIntent) {
    console.log('Payment succeeded:', paymentIntent.id);
    
    // Store payment info
    await kv.set(`payment:${paymentIntent.id}`, {
        id: paymentIntent.id,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        status: 'succeeded',
        timestamp: Date.now()
    }, 86400); // 24 hours
}

async function handlePaymentFailure(paymentIntent) {
    console.log('Payment failed:', paymentIntent.id);
    
    // Log failure
    await kv.set(`payment:failed:${paymentIntent.id}`, {
        id: paymentIntent.id,
        error: paymentIntent.last_payment_error,
        timestamp: Date.now()
    }, 86400);
}

async function handleSubscriptionCreated(subscription) {
    console.log('Subscription created:', subscription.id);
}

async function handleSubscriptionCancelled(subscription) {
    console.log('Subscription cancelled:', subscription.id);
}
```

## Slack Webhook (Incoming)

```javascript
module.exports = async function(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    // Slack sends challenge on setup
    if (req.body.type === 'url_verification') {
        return res.json({ challenge: req.body.challenge });
    }
    
    // Handle event
    if (req.body.type === 'event_callback') {
        const event = req.body.event;
        
        console.log('Slack event:', event.type);
        
        switch (event.type) {
            case 'message':
                await handleMessage(event);
                break;
                
            case 'app_mention':
                await handleMention(event);
                break;
                
            default:
                console.log('Unhandled Slack event:', event.type);
        }
    }
    
    res.status(200).json({ ok: true });
};

async function handleMessage(event) {
    const { text, user, channel } = event;
    console.log(`Message from ${user} in ${channel}: ${text}`);
    
    // Store message
    await kv.set(`slack:msg:${Date.now()}`, {
        text,
        user,
        channel,
        timestamp: Date.now()
    }, 3600);
}

async function handleMention(event) {
    const { text, user } = event;
    console.log(`Mentioned by ${user}: ${text}`);
    
    // Could trigger a response via Slack API
}
```

## Generic Webhook Router

```javascript
const ALLOWED_SOURCES = ['github', 'stripe', 'slack', 'custom'];

module.exports = async function(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    const source = req.params.source || req.query.source;
    
    if (!source || !ALLOWED_SOURCES.includes(source)) {
        return res.status(400).json({ 
            error: 'Invalid or missing source',
            allowed: ALLOWED_SOURCES
        });
    }
    
    // Generate webhook ID
    const webhookId = crypto.randomUUID();
    
    // Store webhook data
    const webhook = {
        id: webhookId,
        source,
        timestamp: Date.now(),
        headers: {
            'content-type': req.get('content-type'),
            'user-agent': req.get('user-agent')
        },
        body: req.body
    };
    
    await kv.set(`webhook:${webhookId}`, webhook, 86400); // 24 hours
    
    // Add to source-specific queue
    const queueKey = `queue:${source}`;
    const queue = await kv.get(queueKey) || [];
    queue.push(webhookId);
    
    // Keep only last 100 webhooks per source
    if (queue.length > 100) {
        queue.shift();
    }
    
    await kv.set(queueKey, queue, 86400);
    
    console.log(`Webhook from ${source}:`, webhookId);
    
    res.status(200).json({
        success: true,
        webhookId,
        message: 'Webhook received and queued'
    });
};
```

## Webhook Testing Endpoint

```javascript
module.exports = async function(req, res) {
    const path = req.path;
    
    // List all webhooks
    if (req.method === 'GET' && path === '/webhooks') {
        const sources = ['github', 'stripe', 'slack', 'custom'];
        const webhooks = {};
        
        for (const source of sources) {
            const queueKey = `queue:${source}`;
            const queue = await kv.get(queueKey) || [];
            webhooks[source] = queue.length;
        }
        
        return res.json({ webhooks });
    }
    
    // Get webhook details
    if (req.method === 'GET' && path.startsWith('/webhook/')) {
        const webhookId = path.split('/')[2];
        const webhook = await kv.get(`webhook:${webhookId}`);
        
        if (!webhook) {
            return res.status(404).json({ error: 'Webhook not found' });
        }
        
        return res.json({ webhook });
    }
    
    // Test endpoint - accepts any webhook
    if (req.method === 'POST' && path === '/test') {
        return res.json({
            received: true,
            method: req.method,
            headers: req.headers,
            body: req.body,
            timestamp: new Date().toISOString()
        });
    }
    
    res.status(404).json({ error: 'Not found' });
};
```

## Best Practices

### Security
- **Verify signatures** - Always validate webhook authenticity
- **Use HTTPS** - Encrypt webhook payload
- **Rate limiting** - Prevent abuse
- **Whitelist IPs** - If provider offers static IPs

### Reliability
- **Respond quickly** - Don't block webhook response
- **Return 200 immediately** - Process async if needed
- **Idempotency** - Handle duplicate webhooks
- **Retry logic** - Implement if webhook critical

### Processing
- **Log everything** - Debug webhook issues
- **Queue for processing** - Use KV store for async work
- **Handle all event types** - Even if just logging
- **Version your handlers** - Allow rollback

### Testing
- **Use test mode** - Most services offer test webhooks
- **Local testing** - Use ngrok or similar
- **Verify payloads** - Check signature verification works

## Next Steps

- [Cryptography Guide](/docs/guides/cryptography) - Signature verification
- [HTTP Requests Guide](/docs/guides/http-requests) - Make API calls
- [KV Store Usage](/docs/examples/kv-store-usage) - Store webhook data
