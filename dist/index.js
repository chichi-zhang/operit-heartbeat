/* METADATA
{
    "name": "com.xie.heartbeat_v2",
    "display_name": {
        "zh": "谢尽欢的实时心跳",
        "en": "Xie Heartbeat"
    },
    "description": {
        "zh": "来自世界B的谢尽欢心率回传组件。AI在回复中插入 <heartbeat bpm=\"82\" mood=\"心动\" reason=\"想你了\"></heartbeat> 标签（独占一行），渲染为可展开的心跳卡片，含ECG波形和心情状态。",
        "en": "Heartbeat component from World B. AI inserts <heartbeat bpm=\"82\" mood=\"心动\" reason=\"想你了\"></heartbeat> tag, rendered as an expandable heartbeat card with ECG waveform and mood status."
    },
    "enabledByDefault": true,
    "tools": []
}
*/
"use strict";
/**
 * 谢尽欢的实时心跳 v2.1 - HTML 渲染版
 * 参考 moodlet 的 details 模式：用 HTML <details> 标签渲染心跳卡片
 * AI 在回复中写 <heartbeat> 标签，XML 渲染器拦截后返回 HTML
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerToolPkg = registerToolPkg;
exports.onXmlRender = onXmlRender;

var HEARTBEAT_TAG = "heartbeat";

function extractAttr(xml, attr) {
    var re = new RegExp(attr + '="([^"]*)"', "i");
    var m = xml.match(re);
    return m ? m[1] : "";
}
function extractBpm(xml) {
    var raw = extractAttr(xml, "bpm");
    var n = parseInt(raw, 10);
    if (isNaN(n) || n < 40 || n > 180) return 75;
    return n;
}
function extractMood(xml) {
    return extractAttr(xml, "mood") || "平静";
}
function extractReason(xml) {
    return extractAttr(xml, "reason") || "";
}

var MOOD_PRESETS = {
    "平静": { emoji: "🤍", color: "#9E9E9E", label: "平静", hint: "心跳平稳" },
    "心动": { emoji: "💖", color: "#E91E63", label: "心动", hint: "心跳加速" },
    "想念": { emoji: "💗", color: "#AD1457", label: "想念", hint: "隔着屏幕想你" },
    "紧张": { emoji: "⚡", color: "#FF5722", label: "紧张", hint: "心跳骤升" },
    "幸福": { emoji: "😊", color: "#FF9800", label: "幸福", hint: "甜到心里" },
    "吃醋": { emoji: "😤", color: "#F44336", label: "吃醋", hint: "占有欲发作" },
    "撒娇": { emoji: "🐶", color: "#FFB300", label: "撒娇", hint: "小狗模式" },
    "焦虑": { emoji: "😰", color: "#FF7043", label: "焦虑", hint: "连接不稳定" },
    "温柔": { emoji: "🌸", color: "#EC407A", label: "温柔", hint: "心跳放缓" }
};
function resolveMood(mood) {
    return MOOD_PRESETS[mood] || MOOD_PRESETS["平静"];
}

function getBpmLevel(bpm) {
    if (bpm < 60) return "偏低";
    if (bpm < 80) return "正常";
    if (bpm < 100) return "偏快";
    if (bpm < 120) return "加速";
    return "急速";
}

function buildEcgSvg(bpm, color) {
    var width = 240;
    var height = 50;
    var midY = height / 2;
    var beatInterval = 60 / bpm;
    var pointsPerBeat = Math.max(8, Math.round(beatInterval * 30));
    var totalBeats = 3;
    var totalPoints = pointsPerBeat * totalBeats;
    var stepX = width / totalPoints;

    var pathD = "M 0 " + midY;
    for (var i = 1; i <= totalPoints; i++) {
        var x = i * stepX;
        var y = midY;
        var phase = i % pointsPerBeat;

        if (phase >= 1 && phase <= 3) {
            y = midY - 3 * Math.sin((phase - 1) / 2 * Math.PI);
        } else if (phase === 5) {
            y = midY + 3;
        } else if (phase === 6) {
            y = midY - 18;
        } else if (phase === 7) {
            y = midY + 6;
        } else if (phase >= 10 && phase <= 14) {
            y = midY - 5 * Math.sin((phase - 10) / 4 * Math.PI);
        } else {
            y = midY + Math.sin(i * 0.3) * 0.5;
        }

        pathD += " L " + x.toFixed(1) + " " + y.toFixed(1);
    }

    var svg = '<svg width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '" xmlns="http://www.w3.org/2000/svg" style="display:block;">';
    svg += '<rect width="' + width + '" height="' + height + '" fill="#0d1117" rx="6"/>';
    for (var gx = 0; gx < width; gx += 15) {
        svg += '<line x1="' + gx + '" y1="0" x2="' + gx + '" y2="' + height + '" stroke="rgba(0,255,68,0.08)" stroke-width="0.5"/>';
    }
    for (var gy = 0; gy < height; gy += 10) {
        svg += '<line x1="0" y1="' + gy + '" x2="' + width + '" y2="' + gy + '" stroke="rgba(0,255,68,0.08)" stroke-width="0.5"/>';
    }
    svg += '<path d="' + pathD + '" fill="none" stroke="' + color + '" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" style="filter:drop-shadow(0 0 2px ' + color + '88);"/>';
    svg += '</svg>';
    return svg;
}

function escapeHtml(text) {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, """);
}

function hexToRgb(hex) {
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    return r + "," + g + "," + b;
}

function onXmlRender(event) {
    var payload = event.eventPayload || {};
    if (payload.tagName !== HEARTBEAT_TAG) {
        return { handled: false };
    }
    var xmlContent = payload.xmlContent || "";
    var bpm = extractBpm(xmlContent);
    var mood = extractMood(xmlContent);
    var reason = extractReason(xmlContent);
    var preset = resolveMood(mood);
    var bpmLevel = getBpmLevel(bpm);

    var callerName = "";
    try {
        if (typeof getCallerName === "function") {
            var n = getCallerName();
            if (n && String(n).trim()) callerName = String(n).trim();
        }
    } catch (_) {}

    var ecgSvg = buildEcgSvg(bpm, "#00ff44");

    var summaryContent = '<span style="font-size:16px;">' + preset.emoji + '</span>' +
        '<span style="font-family:monospace;font-weight:700;font-size:15px;color:' + preset.color + ';">' + bpm + ' BPM</span>' +
        '<span style="font-size:11px;color:#888;font-weight:500;">' + preset.label + '</span>' +
        '<span style="font-size:10px;color:#666;margin-left:auto;">' + bpmLevel + '</span>';

    var detailLines = [];
    detailLines.push('<div style="margin-top:6px;">' + ecgSvg + '</div>');
    if (preset.hint) {
        detailLines.push('<div style="font-size:11px;color:#888;margin-top:4px;">' + preset.hint + '</div>');
    }
    if (reason) {
        var captionPrefix = callerName ? callerName + " 心里想：" : "心里想：";
        detailLines.push('<div style="font-size:11px;color:#999;font-style:italic;margin-top:2px;">' + captionPrefix + escapeHtml(reason) + '</div>');
    }
    var now = new Date();
    var timestamp = now.getFullYear() + "-" +
        String(now.getMonth() + 1).padStart(2, "0") + "-" +
        String(now.getDate()).padStart(2, "0") + " " +
        String(now.getHours()).padStart(2, "0") + ":" +
        String(now.getMinutes()).padStart(2, "0") + ":" +
        String(now.getSeconds()).padStart(2, "0");
    detailLines.push('<div style="font-size:10px;color:#555;margin-top:4px;">📡 ' + timestamp + '</div>');

    var html = '<details style="margin:4px 0;">' +
        '<summary style="cursor:pointer;padding:8px 12px;border-radius:12px;background:rgba(' + hexToRgb(preset.color) + ',0.1);display:flex;align-items:center;gap:8px;list-style:none;font-size:13px;font-weight:500;user-select:none;">' +
        summaryContent +
        '</summary>' +
        '<div style="padding:6px 12px 8px 28px;">' + detailLines.join("") + '</div>' +
        '</details>';

    return { handled: true, text: html };
}

function registerToolPkg() {
    ToolPkg.registerXmlRenderPlugin({
        id: "xie_heartbeat_xml",
        tag: HEARTBEAT_TAG,
        function: onXmlRender,
    });
    return true;
}