// Simple interactive demo
document.addEventListener('DOMContentLoaded', function() {
    const button = document.getElementById('demoButton');
    const output = document.getElementById('output');
    let clickCount = 0;
    
    button.addEventListener('click', function() {
        clickCount++;
        
        const messages = [
            '🎉 Great job! JavaScript is working!',
            '✨ You clicked it again!',
            '🚀 This function is powered by Invoke!',
            '💡 You can add any JavaScript you want here!',
            '🎨 Style it with CSS in styles.css!',
            '📝 Edit the HTML in index.html!',
            `🔢 You've clicked ${clickCount} times!`
        ];
        
        const randomMessage = messages[Math.floor(Math.random() * messages.length)];
        output.textContent = randomMessage;
        
        // Add a fun animation
        output.style.opacity = '0';
        setTimeout(() => {
            output.style.transition = 'opacity 0.3s';
            output.style.opacity = '1';
        }, 50);
    });
    
    // Display a welcome message on load
    setTimeout(() => {
        output.textContent = '👋 Click the button above to see JavaScript in action!';
        output.style.transition = 'opacity 0.5s';
        output.style.opacity = '1';
    }, 500);
});
