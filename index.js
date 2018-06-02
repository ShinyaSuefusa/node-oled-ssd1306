var async = require('async');
var fs = require('fs');
var Canvas = require('canvas');
var Ssd1306 = require('./SSD1306');

var Image = Canvas.Image;

var opts = {
    width: 128,
    height: 64,
    address: 0x3c
};

var ssd1306 = new Ssd1306(opts);
ssd1306.clearDisplay();
ssd1306.update();
ssd1306.drawLine(128, 0, 0, 64, 1, true);
//ssd1306.update();


var bayerThresholdMap = [
    [  15, 135,  45, 165 ],
    [ 195,  75, 225, 105 ],
    [  60, 180,  30, 150 ],
    [ 240, 120, 210,  90 ]
];

var lumR = [];
var lumG = [];
var lumB = [];
for (var i=0; i<256; i++) {
    lumR[i] = i*0.299;
    lumG[i] = i*0.587;
    lumB[i] = i*0.114;
}

function actual(fore, alpha, back) {
    return Math.floor(back * (1 - alpha / 255) + fore * (alpha / 255));
}

function monochrome(imageData, threshold, bkColor, type, negative){

    var imageDataLength = imageData.data.length;
    var bkR = bkColor & 255;
    var bkG = (bkColor >> 8) & 255;
    var bkB = (bkColor >> 16) & 255;
    var on = negative ? 0 : 255;
    var off = negative ? 255 : 0;

    // Greyscale luminance (sets r pixels to luminance of rgb)
    for (var i = 0; i <= imageDataLength; i += 4) {
        var alpha = imageData.data[i+3];

        imageData.data[i] = Math.floor(lumR[actual(imageData.data[i], alpha, bkR)] + lumG[actual(imageData.data[i+1], alpha, bkG)] + lumB[actual(imageData.data[i+2], alpha, bkB)]);
    }

    var w = imageData.width;
    var newPixel, err;
    var data = new Array(imageDataLength / 4);

    for (var currentPixel = 0; currentPixel <= imageDataLength; currentPixel+=4) {

        if (type === "none") {
            // No dithering
            imageData.data[currentPixel] = imageData.data[currentPixel] < threshold ? off : on;
        } else if (type === "bayer") {
            // 4x4 Bayer ordered dithering algorithm
            var x = currentPixel/4 % w;
            var y = Math.floor(currentPixel/4 / w);
            var map = Math.floor( (imageData.data[currentPixel] + bayerThresholdMap[x%4][y%4]) / 2 );
            imageData.data[currentPixel] = (map < threshold) ? off : on;
        } else if (type === "floydsteinberg") {
            // Floyd–Steinberg dithering algorithm
            newPixel = imageData.data[currentPixel] < 129 ? off : on;
            err = Math.floor((imageData.data[currentPixel] - newPixel) / 16);
            imageData.data[currentPixel] = newPixel;

            imageData.data[currentPixel       + 4 ] += err*7;
            imageData.data[currentPixel + 4*w - 4 ] += err*3;
            imageData.data[currentPixel + 4*w     ] += err*5;
            imageData.data[currentPixel + 4*w + 4 ] += err*1;
        } else {
            // Bill Atkinson's dithering algorithm
            newPixel = imageData.data[currentPixel] < threshold ? off : on;
            err = Math.floor((imageData.data[currentPixel] - newPixel) / 8);
            imageData.data[currentPixel] = newPixel;

            imageData.data[currentPixel       + 4 ] += err;
            imageData.data[currentPixel       + 8 ] += err;
            imageData.data[currentPixel + 4*w - 4 ] += err;
            imageData.data[currentPixel + 4*w     ] += err;
            imageData.data[currentPixel + 4*w + 4 ] += err;
            imageData.data[currentPixel + 8*w     ] += err;
        }

        // Set g and b pixels equal to r
        imageData.data[currentPixel + 1] = imageData.data[currentPixel + 2] = imageData.data[currentPixel];
        // Set a is 100%
        imageData.data[currentPixel + 3] = 255;
        // Set data
        data[currentPixel / 4] = imageData.data[currentPixel];
    }

    return data;
}

var srcCanvas = new Canvas(128, 64);
var srcContext = srcCanvas.getContext('2d');
//var dstCanvas = new Canvas(128, 64);
//var dstContext = dstCanvas.getContext('2d');

// イメージを更新する
var imageUpdate = function() {
    // ディザ変換！
    var img = srcContext.getImageData(0, 0, srcCanvas.width, srcCanvas.height);
    var img2 = monochrome(img, 128, 0xFFFFFF, "bayer", true);

    // ディストに転送～
    //dstContext.putImageData(img, 0, 0);

    // [x, y, color]の配列に変換
    var data = [];
    for (var y = 0; y < srcCanvas.height; y++) {
        for (var x = 0; x < srcCanvas.width; x++) {
            data.push([x, y, img2[y*srcCanvas.width + x] ? 1 : 0]);
        }
    }
    // SSD1306に転送！！
    ssd1306.drawPixel(data);
    ssd1306.update();
};

// キャンバスをクリアする
var clearCanvas = function() {
    srcContext.clearRect(0, 0, srcCanvas.width, srcCanvas.height);
    //dstContext.clearRect(0, 0, dstCanvas.width, dstCanvas.height);
    imageUpdate();
};

// ぴーぷるくんを描いてみる
var drawPeoplekun = function() {
    clearCanvas();

    fs.readFile(__dirname + '/img/people.png', function(err, data) {
        if (err) throw err;

        var img = new Image();
        img.src = data;

        srcContext.drawImage(img, 0, 20, 128, 30);
        imageUpdate();
    });
};
drawPeoplekun();

function sleep(time) {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            resolve();
        }, time);
    });
}

setTimeout(() => {
    console.log('finish.');
}, 10000);