// DOM元素
const localIdEl = document.getElementById('localId');
const remoteIdEl = document.getElementById('remoteId');
const createIdBtn = document.getElementById('createIdBtn');
const connectBtn = document.getElementById('connectBtn');
const statusEl = document.getElementById('status');
const chatAreaEl = document.getElementById('chatArea');
const messageEl = document.getElementById('message');
const sendBtn = document.getElementById('sendBtn');
// 新增文件传输相关DOM元素
const fileInput = document.getElementById('fileInput');
const fileSelectBtn = document.getElementById('fileSelectBtn');
const fileSendBtn = document.getElementById('fileSendBtn');

// WebRTC连接变量
let peerConnection;
let dataChannel;
let localId;
let eventSource;
// 文件传输相关变量
let selectedFile = null;
let receiveBuffer = [];
let receivedSize = 0;
let currentFileTransfer = null;  // 改名为 currentFileTransfer
const CHUNK_SIZE = 16384; // 16KB

// 配置ICE服务器（STUN/TURN）
const iceServers = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
        // 添加免费TURN服务器 - 注意：在生产环境中应使用自己的TURN服务器
        {
            urls: 'turn:openrelay.metered.ca:80',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        },
        {
            urls: 'turn:openrelay.metered.ca:443',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        }
    ],
    iceCandidatePoolSize: 10,
    iceTransportPolicy: 'all'
};

// 初始化
createIdBtn.addEventListener('click', createId);
connectBtn.addEventListener('click', connectToPeer);
sendBtn.addEventListener('click', sendMessage);
messageEl.addEventListener('keypress', e => {
    if (e.key === 'Enter') sendMessage();
});
// 新增文件传输相关事件监听
fileSelectBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', handleFileSelect);
fileSendBtn.addEventListener('click', sendFile);

// 生成本地ID并连接到信令服务器
function createId() {
    localId = generateRandomId();
    localIdEl.textContent = localId;
    createIdBtn.disabled = true;
    
    // 连接到信令服务器
    connectToSignalingServer();
    updateStatus('已生成ID，等待连接...');
    
    // 生成分享链接
    generateShareLink();
}

// 生成分享链接
function generateShareLink() {
    const shareUrl = `${window.location.origin}${window.location.pathname}?connect=${localId}`;
    
    // 创建分享链接元素
    const shareLinkContainer = document.createElement('div');
    shareLinkContainer.className = 'share-link-container';
    
    const shareLinkLabel = document.createElement('div');
    shareLinkLabel.textContent = '分享链接:';
    shareLinkContainer.appendChild(shareLinkLabel);
    
    const shareLinkInput = document.createElement('input');
    shareLinkInput.type = 'text';
    shareLinkInput.value = shareUrl;
    shareLinkInput.readOnly = true;
    shareLinkContainer.appendChild(shareLinkInput);
    
    const copyBtn = document.createElement('button');
    copyBtn.textContent = '复制';
    copyBtn.onclick = () => {
        shareLinkInput.select();
        document.execCommand('copy');
        copyBtn.textContent = '已复制!';
        setTimeout(() => copyBtn.textContent = '复制', 2000);
    };
    shareLinkContainer.appendChild(copyBtn);
    
    // 添加到页面
    const connectionContainer = document.querySelector('#connectionControls');
    connectionContainer.appendChild(shareLinkContainer);
}

// 检查URL参数并自动连接
function checkUrlAndConnect() {
    const urlParams = new URLSearchParams(window.location.search);
    const connectToId = urlParams.get('connect');
    
    if (connectToId) {
        // 自动生成本地ID
        createId();
        
        // 填入远程ID并连接
        remoteIdEl.value = connectToId;
        
        // 短暂延迟确保信令连接已建立
        setTimeout(() => {
            connectToPeer();
        }, 1000);
    }
}

// 页面加载完成后检查URL参数
window.addEventListener('DOMContentLoaded', checkUrlAndConnect);
function connectToSignalingServer() {
    // 使用SSE连接到信令服务器
    eventSource = new EventSource(`signaling.php?id=${localId}`);
    
    eventSource.onopen = () => {
        console.log('已连接到信令服务器');
    };
    
    eventSource.onerror = (error) => {
        console.error('信令服务器连接错误:', error);
        updateStatus('信令服务器连接错误');
    };
    
    // 监听来自信令服务器的消息
    eventSource.addEventListener('offer', event => {
        const data = JSON.parse(event.data);
        handleOffer(data.offer, data.from);
    });
    
    eventSource.addEventListener('answer', event => {
        const data = JSON.parse(event.data);
        handleAnswer(data.answer);
    });
    
    eventSource.addEventListener('candidate', event => {
        const data = JSON.parse(event.data);
        handleCandidate(data.candidate);
    });
}

// 连接到对等方
function connectToPeer() {
    const remoteId = remoteIdEl.value.trim();
    if (!remoteId) {
        alert('请输入对方ID');
        return;
    }
    
    // 创建对等连接
    createPeerConnection();
    
    // 创建数据通道
    dataChannel = peerConnection.createDataChannel('chat');
    setupDataChannel(dataChannel);
    
    // 创建并发送offer
    peerConnection.createOffer()
        .then(offer => peerConnection.setLocalDescription(offer))
        .then(() => {
            // 通过信令服务器发送offer
            sendSignalingMessage({
                type: 'offer',
                offer: peerConnection.localDescription,
                from: localId,
                to: remoteId
            });
            updateStatus('正在连接...');
        })
        .catch(error => {
            console.error('创建offer失败:', error);
            updateStatus('连接失败');
        });
}

// 创建对等连接
function createPeerConnection() {
    // 设置ICE连接超时
    const iceConnectionTimeout = 15000; // 15秒
    let iceConnectionTimer;
    
    peerConnection = new RTCPeerConnection(iceServers);
    
    // 监听ICE候选
    peerConnection.onicecandidate = event => {
        if (event.candidate) {
            sendSignalingMessage({
                type: 'candidate',
                candidate: event.candidate,
                from: localId,
                to: remoteIdEl.value.trim()
            });
        }
    };
    
    // 监听ICE连接状态
    peerConnection.oniceconnectionstatechange = () => {
        console.log('ICE连接状态:', peerConnection.iceConnectionState);
        
        if (peerConnection.iceConnectionState === 'checking') {
            // 设置ICE连接超时计时器
            clearTimeout(iceConnectionTimer);
            iceConnectionTimer = setTimeout(() => {
                if (peerConnection.iceConnectionState === 'checking') {
                    console.warn('ICE连接超时，尝试使用中继服务器');
                    updateStatus('连接超时，尝试使用中继服务器...');
                }
            }, iceConnectionTimeout);
        } else if (peerConnection.iceConnectionState === 'connected' || 
                  peerConnection.iceConnectionState === 'completed') {
            // 清除超时计时器
            clearTimeout(iceConnectionTimer);
        }
    };
    
    // 监听连接状态变化
    peerConnection.onconnectionstatechange = () => {
        console.log('连接状态:', peerConnection.connectionState);
        if (peerConnection.connectionState === 'connected') {
            updateStatus('已连接');
            enableChat();
        } else if (['disconnected', 'failed', 'closed'].includes(peerConnection.connectionState)) {
            updateStatus('连接已断开');
            disableChat();
            
            // 如果连接失败，显示更详细的错误信息
            if (peerConnection.connectionState === 'failed') {
                console.error('连接失败，可能原因：NAT穿透失败或网络限制');
                updateStatus('连接失败：请检查网络环境或尝试使用同一网络');
            }
        }
    };
    
    // 监听数据通道
    peerConnection.ondatachannel = event => {
        dataChannel = event.channel;
        setupDataChannel(dataChannel);
    };
}

// 设置数据通道
function setupDataChannel(channel) {
    channel.onopen = () => {
        console.log('数据通道已打开');
        enableChat();
    };
    
    channel.onclose = () => {
        console.log('数据通道已关闭');
        disableChat();
    };
    
    channel.onmessage = event => {
        // 检查消息类型
        if (typeof event.data === 'string') {
            try {
                const data = JSON.parse(event.data);
                console.log('0收到消息:', data);
                
                // 处理不同类型的消息
                if (data.type === 'file-info') {
                    // 接收文件信息
                    console.log('1开始处理文件信息file-info:', data);
                    handleFileInfo(data);
                } 
                else if (data.type === 'file-complete') {
                    // 文件传输完成
                    console.log('3文件传输完成');
                    handleFileComplete();
                } else {
                    // 普通文本消息
                    console.log('1收到普通文本消息:', data);
                    displayMessage(event.data, false);
                }
            } catch (e) {
                // 普通文本消息
                displayMessage(event.data, false);
            }
        } else {
            // 二进制数据（文件块）
            ////console.log('2收到二进制数据（文件块）',event.data);
            handleFileChunk(event.data);
        }
    };
}

// 处理收到的offer
function handleOffer(offer, fromId) {
    remoteIdEl.value = fromId;
    createPeerConnection();
    
    peerConnection.setRemoteDescription(new RTCSessionDescription(offer))
        .then(() => peerConnection.createAnswer())
        .then(answer => peerConnection.setLocalDescription(answer))
        .then(() => {
            sendSignalingMessage({
                type: 'answer',
                answer: peerConnection.localDescription,
                from: localId,
                to: fromId
            });
            updateStatus('正在连接...');
        })
        .catch(error => {
            console.error('处理offer失败:', error);
            updateStatus('连接失败');
        });
}

// 处理收到的answer
function handleAnswer(answer) {
    peerConnection.setRemoteDescription(new RTCSessionDescription(answer))
        .catch(error => {
            console.error('处理answer失败:', error);
            updateStatus('连接失败');
        });
}

// 处理收到的ICE候选
function handleCandidate(candidate) {
    peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
        .catch(error => {
            console.error('添加ICE候选失败:', error);
        });
}

// 发送消息
function sendMessage() {
    const message = messageEl.value.trim();
    if (!message || !dataChannel) return;
    
    dataChannel.send(message);
    displayMessage(message, true);
    messageEl.value = '';
}

// 显示消息
function displayMessage(message, isSent) {
    const messageEl = document.createElement('div');
    messageEl.className = `message ${isSent ? 'sent' : 'received'}`;
    messageEl.textContent = message;
    chatAreaEl.appendChild(messageEl);
    chatAreaEl.scrollTop = chatAreaEl.scrollHeight;
}

// 更新状态
function updateStatus(status) {
    statusEl.textContent = `状态: ${status}`;
}

// 启用聊天
function enableChat() {
    messageEl.disabled = false;
    sendBtn.disabled = false;
    fileSelectBtn.disabled = false;
    fileSendBtn.disabled = false;
    messageEl.focus();
}

// 禁用聊天
function disableChat() {
    messageEl.disabled = true;
    sendBtn.disabled = true;
    fileSelectBtn.disabled = true;
    fileSendBtn.disabled = true;
}

// 生成随机ID
function generateRandomId() {
    return Math.random().toString(36).substr(2, 9);
}

// 发送信令消息
function sendSignalingMessage(message) {
    fetch('send_signal.php', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(message)
    })
    .catch(error => {
        console.error('发送信令消息失败:', error);
    });
}

// 处理文件选择
function handleFileSelect(event) {
    selectedFile = event.target.files[0];
    if (selectedFile) {
        fileSendBtn.textContent = `发送: ${selectedFile.name}`;
    }
}
// 发送文件
function sendFile() {
    if (!selectedFile || !dataChannel) return;
    
    // 发送文件信息
    const fileInfo = {
        type: 'file-info',
        name: selectedFile.name,
        size: selectedFile.size,
        fileType: selectedFile.type  // 将 type 改为 fileType，避免与消息类型冲突
    };
    console.log('发送文件信息:', fileInfo);
    dataChannel.send(JSON.stringify(fileInfo));
    
    // 显示发送文件消息
    displayFileMessage(fileInfo, true);
    
    // 读取并发送文件
    const reader = new FileReader();
    let offset = 0;
    let isSending = false;
    
    // 检查缓冲区并发送数据
    function sendNextChunk() {
        if (offset >= selectedFile.size) {
            // 文件发送完成
            dataChannel.send(JSON.stringify({ type: 'file-complete' }));
            // 重置文件选择
            fileInput.value = '';
            selectedFile = null;
            fileSendBtn.textContent = '发送文件';
            return;
        }
        
        // 检查数据通道缓冲区
        if (dataChannel.bufferedAmount > dataChannel.bufferedAmountLowThreshold) {
            // 缓冲区已满，等待缓冲区清空事件
            console.log('数据通道缓冲区已满，等待发送...');
            return;
        }
        
        // 读取下一个分片
        readSlice(offset);
    }
    
    // 监听缓冲区状态
    dataChannel.bufferedAmountLowThreshold = CHUNK_SIZE;
    dataChannel.onbufferedamountlow = sendNextChunk;
    
    reader.onload = (event) => {
        dataChannel.send(event.target.result);
        offset += event.target.result.byteLength;
        
        // 更新进度
        const progress = document.querySelector(`.sent[data-file="${fileInfo.name}"] .progress`);
        if (progress) {
            const percentage = Math.min(100, Math.round((offset / selectedFile.size) * 100));
            progress.style.width = `${percentage}%`;
        }
        
        // 检查是否继续发送
        setTimeout(sendNextChunk, 0);
    };
    
    reader.onerror = (error) => {
        console.error('读取文件错误:', error);
        alert('读取文件失败');
    };
    
    // 读取文件分片
    function readSlice(offset) {
        const slice = selectedFile.slice(offset, offset + CHUNK_SIZE);
        reader.readAsArrayBuffer(slice);
    }
    
    // 开始读取
    sendNextChunk();
}

// 处理接收到的文件信息
function handleFileInfo(data) {
    receiveBuffer = [];
    receivedSize = 0;
    currentFileTransfer = data;  // 使用新名称
    console.log('开始处理文件信息:', currentFileTransfer);
    displayFileMessage(currentFileTransfer, false);
}

// 处理接收到的文件块
function handleFileChunk(chunk) {
    receiveBuffer.push(chunk);
    receivedSize += chunk.byteLength;
    
    if (currentFileTransfer) {  // 使用新名称
        const progress = document.querySelector(`.received[data-file="${currentFileTransfer.name}"] .progress`);
        if (progress) {
            const percentage = Math.min(100, Math.round((receivedSize / currentFileTransfer.size) * 100));
            progress.style.width = `${percentage}%`;
        }
    }
}

// 处理文件接收完成
function handleFileComplete() {
    try {
        console.log('开始处理文件完成事件');
        console.log('接收缓冲区大小:', receiveBuffer.length);
        
        if (!currentFileTransfer) {  // 使用新名称
            console.error('文件信息不存在');
            return;
        }
        
        const fileType = currentFileTransfer.fileType || 'application/octet-stream';  // 使用新名称
        const received = new Blob(receiveBuffer, { type: fileType });
        console.log('文件合并完成，大小:', received.size);
        
        const downloadLink = document.querySelector(`.received[data-file="${currentFileTransfer.name}"] .download-btn`);  // 使用新名称
        if (!downloadLink) {
            console.error('未找到下载按钮元素');
            return;
        }
        
        const url = URL.createObjectURL(received);
        console.log('创建Blob URL:', url);
        
        downloadLink.href = url;
        downloadLink.download = currentFileTransfer.name;
        downloadLink.style.display = 'inline-block';
        downloadLink.textContent = '下载';
        
        // 自动触发下载
        try {
            const autoDownloadLink = document.createElement('a');
            autoDownloadLink.href = url;
            autoDownloadLink.download = currentFileTransfer.name;
            document.body.appendChild(autoDownloadLink);
            autoDownloadLink.click();
            document.body.removeChild(autoDownloadLink);
            
            // 更新下载按钮文本
            downloadLink.textContent = '再次下载';
            console.log('自动下载触发完成');
        } catch (downloadError) {
            console.error('自动下载失败:', downloadError);
        }
        
        // 清理资源
        receiveBuffer = [];
        receivedSize = 0;
        currentFileTransfer = null;  // 使用新名称
        console.log('文件处理完成');
        
    } catch (error) {
        console.error('处理文件完成事件出错:', error);
        alert('文件处理失败，请重试');
    }
}
function displayFileMessage(fileInfo, isSent) {
    const fileMessageEl = document.createElement('div');
    fileMessageEl.className = `file-message ${isSent ? 'sent' : 'received'}`;
    fileMessageEl.setAttribute('data-file', fileInfo.name);
    
    // 文件图标
    const fileIconEl = document.createElement('div');
    fileIconEl.className = 'file-icon';
    fileIconEl.innerHTML = '📁';
    
    // 文件信息
    const fileInfoEl = document.createElement('div');
    fileInfoEl.className = 'file-info';
    
    const fileNameEl = document.createElement('div');
    fileNameEl.textContent = fileInfo.name;
    
    const fileSizeEl = document.createElement('div');
    fileSizeEl.textContent = formatFileSize(fileInfo.size);
    
    fileInfoEl.appendChild(fileNameEl);
    fileInfoEl.appendChild(fileSizeEl);
    
    // 进度条
    const progressBarEl = document.createElement('div');
    progressBarEl.className = 'progress-bar';
    
    const progressEl = document.createElement('div');
    progressEl.className = 'progress';
    progressBarEl.appendChild(progressEl);
    
    fileMessageEl.appendChild(fileIconEl);
    fileMessageEl.appendChild(fileInfoEl);
    
    // 下载按钮（接收方）
    if (!isSent) {
        const downloadBtn = document.createElement('a');
        downloadBtn.className = 'download-btn';
        downloadBtn.textContent = '等待接收...';
        downloadBtn.style.display = 'inline-block';
        fileMessageEl.appendChild(downloadBtn);
    }
    
    fileInfoEl.appendChild(progressBarEl);
    chatAreaEl.appendChild(fileMessageEl);
    chatAreaEl.scrollTop = chatAreaEl.scrollHeight;
}

// 格式化文件大小
function formatFileSize(bytes) {
    if (bytes < 1024) {
        return bytes + ' B';
    } else if (bytes < 1024 * 1024) {
        return (bytes / 1024).toFixed(2) + ' KB';
    } else if (bytes < 1024 * 1024 * 1024) {
        return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    } else {
        return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
    }
}