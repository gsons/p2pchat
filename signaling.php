<?php
header('Content-Type: text/event-stream');
header('Cache-Control: no-cache');
header('Connection: keep-alive');

// 允许跨域
header('Access-Control-Allow-Origin: *');

// 获取客户端ID
$clientId = isset($_GET['id']) ? $_GET['id'] : '';

if (empty($clientId)) {
    echo "event: error\n";
    echo "data: Missing client ID\n\n";
    exit;
}

// 设置无限超时
set_time_limit(0);
ignore_user_abort(true);

// 信令消息文件路径
$messagesDir = 'messages';
if (!is_dir($messagesDir)) {
    mkdir($messagesDir, 0777, true);
}

// 发送初始连接消息
echo "event: connected\n";
echo "data: {\"id\":\"$clientId\"}\n\n";
ob_flush();
flush();

// 检查是否有新消息的循环
$lastCheck = time();
while (true) {
    // 检查是否有发送给此客户端的消息
    $messageFiles = glob("$messagesDir/$clientId-*.json");
    
    foreach ($messageFiles as $file) {
        $content = file_get_contents($file);
        $message = json_decode($content, true);
        
        if ($message) {
            // 根据消息类型发送事件
            echo "event: {$message['type']}\n";
            echo "data: " . json_encode($message) . "\n\n";
            ob_flush();
            flush();
        }
        
        // 删除已处理的消息
        unlink($file);
    }
    
    // 防止CPU过载
    sleep(1);
    
    // 每30秒发送一次保持连接的消息
    if (time() - $lastCheck >= 30) {
        echo ": keepalive\n\n";
        ob_flush();
        flush();
        $lastCheck = time();
    }
    
    // 检查连接是否已关闭
    if (connection_aborted()) {
        break;
    }
}
?>