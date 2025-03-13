<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST');
header('Access-Control-Allow-Headers: Content-Type');

// 处理预检请求
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit;
}

// 确保是POST请求
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

// 获取POST数据
$data = json_decode(file_get_contents('php://input'), true);

// 验证数据
if (!$data || !isset($data['type']) || !isset($data['from']) || !isset($data['to'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid data']);
    exit;
}

// 消息目录
$messagesDir = 'messages';
if (!is_dir($messagesDir)) {
    mkdir($messagesDir, 0777, true);
}

// 创建唯一的消息文件名
$filename = "$messagesDir/{$data['to']}-" . uniqid() . ".json";

// 保存消息
if (file_put_contents($filename, json_encode($data))) {
    echo json_encode(['success' => true]);
} else {
    http_response_code(500);
    echo json_encode(['error' => 'Failed to save message']);
}
?>