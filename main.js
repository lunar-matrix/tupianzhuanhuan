document.addEventListener('DOMContentLoaded', () => {
    // PNG CRC32 工具
    const crc32 = (buf) => {
        let c = 0xFFFFFFFF;
        for (let i = 0; i < buf.length; i++) {
            c ^= buf[i];
            for (let j = 0; j < 8; j++) c = (c >>> 1) ^ (c & 1 ? 0xEDB88320 : 0);
        }
        return (c ^ 0xFFFFFFFF) >>> 0;
    };


    lucide.createIcons();


    let filesList = [];
    let currentFileIndex = 0;
    let aspectRatio = 16 / 9;
    let currentDPI = 300;
    let currentOriginalImageObj = null;
    let resizeMode = 'scale'; // 'scale' | 'crop'
    let cropModeBoxPos = { x: 0, y: 0 };


    const dropZone = document.getElementById('drop-zone');
    const previewZone = document.getElementById('preview-zone');
    const fileInput = document.getElementById('file-input');
    const queueContainer = document.getElementById('queue-container');
    const batchCount = document.getElementById('batch-count');
    const processBtn = document.getElementById('process-btn');


    const imgBefore = document.getElementById('img-before');
    const imgAfter = document.getElementById('img-after');
    const beforeWrapper = document.querySelector('.before-img');
    const comparisonDivider = document.querySelector('.comparison-divider');


    const widthInput = document.getElementById('input-width');
    const heightInput = document.getElementById('input-height');
    const linkRatioSwitch = document.getElementById('link-ratio');
    const unitRadios = document.getElementsByName('unit');
    const unitLabels = document.querySelectorAll('.unit-label');


    const idPhotoToggle = document.getElementById('id-photo-toggle');
    const idPhotoSubmenu = document.getElementById('id-photo-submenu');
    const idPhotoChevron = document.getElementById('id-photo-chevron');


    idPhotoToggle.addEventListener('click', () => {
        idPhotoSubmenu.classList.toggle('hidden');
        idPhotoChevron.style.transform = idPhotoSubmenu.classList.contains('hidden') ? '' : 'rotate(180deg)';
    });


    const idPresets = {
        'id-1std': [295, 413],
        'id-1sm': [260, 378],
        'id-1lg': [390, 567],
        'id-2std': [413, 579],
        'id-2sm': [413, 531],
    };


    document.querySelectorAll('.nav-btn').forEach(btn => {
        if (btn === idPhotoToggle) return;
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');


            const presetType = e.currentTarget.getAttribute('data-preset');
            if (!presetType) return;


            if (!presetType.startsWith('id-')) {
                idPhotoSubmenu.classList.add('hidden');
                idPhotoChevron.style.transform = '';
            }


            document.querySelector('input[name="unit"][value="px"]').checked = true;
            unitLabels.forEach(l => l.innerText = 'px');
            linkRatioSwitch.classList.remove('active');


            if (idPresets[presetType]) {
                widthInput.value = idPresets[presetType][0];
                heightInput.value = idPresets[presetType][1];
            } else if (presetType === 'a4') {
                widthInput.value = 2480;
                heightInput.value = 3508;
            }


            updateCalculatedDimensions();
            debouncedRebuild();
        });
    });


    const initComparisonSlider = () => {
        const container = document.querySelector('.comparison-container');
        let isDragging = false;


        const updatePosition = (clientX) => {
            const rect = container.getBoundingClientRect();
            let x = clientX - rect.left;
            x = Math.max(0, Math.min(x, rect.width));
            let percent = (x / rect.width) * 100;
            beforeWrapper.style.width = `${percent}%`;
            comparisonDivider.style.left = `${percent}%`;
        };


        container.addEventListener('mousedown', () => isDragging = true);
        window.addEventListener('mouseup', () => isDragging = false);
        window.addEventListener('mousemove', (e) => {
            if (isDragging) updatePosition(e.clientX);
        });
        container.addEventListener('touchstart', () => isDragging = true);
        window.addEventListener('touchend', () => isDragging = false);
        window.addEventListener('touchmove', (e) => {
            if (isDragging) updatePosition(e.touches[0].clientX);
        });
    };


    document.querySelectorAll('.accordion-trigger').forEach(trigger => {
        trigger.addEventListener('click', () => {
            const isActive = trigger.classList.contains('active');
            document.querySelectorAll('.accordion-trigger').forEach(t => t.classList.remove('active'));
            if (!isActive) trigger.classList.add('active');
        });
    });


    document.querySelectorAll('.nm-switch').forEach(sw => {
        sw.addEventListener('click', () => sw.classList.toggle('active'));
    });


    const initSlider = (id, callback, initialPct) => {
        const container = document.getElementById(id);
        const thumb = container.querySelector('.nm-slider-thumb');
        const fill = container.querySelector('.nm-slider-fill');
        const track = container.querySelector('.nm-slider-track');
        let isDragging = false;


        const update = (clientX) => {
            const rect = track.getBoundingClientRect();
            let percent = ((clientX - rect.left) / rect.width) * 100;
            percent = Math.max(0, Math.min(100, percent));
            thumb.style.left = `${percent}%`;
            fill.style.width = `${percent}%`;
            callback(percent);
        };


        if (initialPct !== undefined) {
            thumb.style.left = `${initialPct}%`;
            fill.style.width = `${initialPct}%`;
        }


        thumb.addEventListener('mousedown', (e) => { e.stopPropagation(); isDragging = true; });
        track.addEventListener('mousedown', (e) => update(e.clientX));
        window.addEventListener('mousemove', (e) => isDragging && update(e.clientX));
        window.addEventListener('mouseup', () => isDragging = false);
    };


    const mmToPx = (mm, dpi) => Math.round((mm * dpi) / 25.4);
    const pxToMm = (px, dpi) => (px * 25.4) / dpi;


    // 获取当前设置的目标像素尺寸
    const getTargetPx = () => {
        const unit = Array.from(unitRadios).find(r => r.checked).value;
        let w = parseFloat(widthInput.value) || 1;
        let h = parseFloat(heightInput.value) || 1;
        if (unit !== 'px') {
            let factor = unit === 'cm' ? 10 : 1;
            w = mmToPx(w * factor, currentDPI);
            h = mmToPx(h * factor, currentDPI);
        }
        return { w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(h)) };
    };


    const updateCalculatedDimensions = () => {
        const { w, h } = getTargetPx();
        document.getElementById('target-res').innerText = `${w} x ${h}`;
    };


    /* ===== 实时预览引擎 ===== */
    let previewCanvas = null;
    let rebuildTimer = null;
    let encodeTimer = null;


    // 在 canvas 上绘制图像（根据 resizeMode）
    const drawImageOnCanvas = (ctx, canvasW, canvasH, img) => {
        if (resizeMode === 'crop' && img) {
            const natW = img.naturalWidth;
            const natH = img.naturalHeight;
            const { w: tw, h: th } = getTargetPx();


            // 裁剪框在原图上的实际像素大小（不能超过原图）
            let srcW = Math.min(tw, natW);
            let srcH = Math.min(th, natH);


            // 如果目标尺寸大于原图，按比例缩小裁剪框
            if (tw > natW || th > natH) {
                const scale = Math.min(natW / tw, natH / th);
                srcW = Math.round(tw * scale);
                srcH = Math.round(th * scale);
            }


            const sx = Math.max(0, Math.min(Math.round(cropModeBoxPos.x), natW - srcW));
            const sy = Math.max(0, Math.min(Math.round(cropModeBoxPos.y), natH - srcH));
            ctx.drawImage(img, sx, sy, srcW, srcH, 0, 0, canvasW, canvasH);
        } else {
            ctx.drawImage(img, 0, 0, canvasW, canvasH);
        }
    };


    const rebuildPreviewCanvas = () => {
        if (!currentOriginalImageObj || !currentOriginalImageObj.complete) return;


        const { w: targetPxW, h: targetPxH } = getTargetPx();


        // 预览限制在 1200px 以内
        const maxDim = 1200;
        let rw = targetPxW, rh = targetPxH;
        if (rw > maxDim || rh > maxDim) {
            const s = maxDim / Math.max(rw, rh);
            rw = Math.round(rw * s);
            rh = Math.round(rh * s);
        }


        previewCanvas = document.createElement('canvas');
        previewCanvas.width = rw;
        previewCanvas.height = rh;
        previewCanvas._targetW = targetPxW;
        previewCanvas._targetH = targetPxH;
        const ctx = previewCanvas.getContext('2d');
        drawImageOnCanvas(ctx, rw, rh, currentOriginalImageObj);


        if (resizeMode === 'crop') updateCropModeOverlay();


        encodePreview();
    };


    const encodePreview = () => {
        if (!previewCanvas) return;


        const formatStr = document.querySelector('input[name="format"]:checked').value;
        let canvas = previewCanvas;


        if (formatStr === 'jpg') {
            canvas = document.createElement('canvas');
            canvas.width = previewCanvas.width;
            canvas.height = previewCanvas.height;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(previewCanvas, 0, 0);
        }


        const mimeType = formatStr === 'png' ? 'image/png' : formatStr === 'webp' ? 'image/webp' : 'image/jpeg';
        const dataUrl = canvas.toDataURL(mimeType, currentQuality);
        imgAfter.src = dataUrl;


        estimateFullSize();
    };


    let sizeEstTimer = null;
    const estimateFullSize = () => {
        clearTimeout(sizeEstTimer);
        document.getElementById('target-size').innerText = '计算中…';
        sizeEstTimer = setTimeout(() => {
            if (!currentOriginalImageObj || !currentOriginalImageObj.complete || !previewCanvas) return;


            const targetW = previewCanvas._targetW;
            const targetH = previewCanvas._targetH;


            // 安全检查：防止创建过大的 canvas
            if (targetW * targetH > 100000000) {
                // 超过 1 亿像素，用预览 canvas 来估算
                const ratio = (targetW * targetH) / (previewCanvas.width * previewCanvas.height);
                const formatStr = document.querySelector('input[name="format"]:checked').value;
                const mimeType = formatStr === 'png' ? 'image/png' : formatStr === 'webp' ? 'image/webp' : 'image/jpeg';
                let tempCanvas = previewCanvas;
                if (formatStr === 'jpg') {
                    tempCanvas = document.createElement('canvas');
                    tempCanvas.width = previewCanvas.width;
                    tempCanvas.height = previewCanvas.height;
                    const tctx = tempCanvas.getContext('2d');
                    tctx.fillStyle = '#FFFFFF';
                    tctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
                    tctx.drawImage(previewCanvas, 0, 0);
                }
                const dataUrl = tempCanvas.toDataURL(mimeType, currentQuality);
                const base64Len = dataUrl.length - dataUrl.indexOf(',') - 1;
                const bytes = Math.round(base64Len * 3 / 4 * ratio);
                const sizeMB = bytes / 1024 / 1024;
                const sizeStr = sizeMB >= 1 ? sizeMB.toFixed(2) + ' MB' : (bytes / 1024).toFixed(0) + ' KB';
                document.getElementById('target-size').innerText = `~${sizeStr}`;
                return;
            }


            const fullCanvas = document.createElement('canvas');
            fullCanvas.width = targetW;
            fullCanvas.height = targetH;
            const ctx = fullCanvas.getContext('2d');


            const formatStr = document.querySelector('input[name="format"]:checked').value;
            if (formatStr === 'jpg') {
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, targetW, targetH);
            }
            drawImageOnCanvas(ctx, targetW, targetH, currentOriginalImageObj);


            const mimeType = formatStr === 'png' ? 'image/png' : formatStr === 'webp' ? 'image/webp' : 'image/jpeg';
            const dataUrl = fullCanvas.toDataURL(mimeType, currentQuality);
            const base64Len = dataUrl.length - dataUrl.indexOf(',') - 1;
            const bytes = Math.round(base64Len * 3 / 4);
            const sizeMB = bytes / 1024 / 1024;
            const sizeStr = sizeMB >= 1 ? sizeMB.toFixed(2) + ' MB' : (bytes / 1024).toFixed(0) + ' KB';
            document.getElementById('target-size').innerText = `~${sizeStr}`;
        }, 300);
    };


    const debouncedRebuild = () => {
        clearTimeout(rebuildTimer);
        rebuildTimer = setTimeout(rebuildPreviewCanvas, 200);
    };
    const debouncedEncode = () => {
        clearTimeout(encodeTimer);
        encodeTimer = setTimeout(encodePreview, 80);
    };


    let currentQuality = 0.9;
    initSlider('slider-quality', (pct) => {
        let q = Math.max(1, Math.round(pct));
        currentQuality = q / 100;
        const fmt = document.querySelector('input[name="format"]:checked').value;
        document.getElementById('quality-val').innerText = fmt === 'png' ? '无损' : `${q}%`;
        debouncedEncode();
    }, 90);


    initSlider('slider-dpi', (pct) => {
        currentDPI = Math.round(72 + (pct * 1200 / 100));
        if (currentDPI < 72) currentDPI = 72;
        document.getElementById('dpi-val').innerText = `${currentDPI} DPI`;
        updateCalculatedDimensions();
        debouncedRebuild();
    }, 19);


    widthInput.addEventListener('input', () => {
        if (linkRatioSwitch.classList.contains('active')) {
            heightInput.value = Math.round(widthInput.value / aspectRatio);
        }
        updateCalculatedDimensions();
        debouncedRebuild();
    });


    heightInput.addEventListener('input', () => {
        if (linkRatioSwitch.classList.contains('active')) {
            widthInput.value = Math.round(heightInput.value * aspectRatio);
        }
        updateCalculatedDimensions();
        debouncedRebuild();
    });


    unitRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            unitLabels.forEach(l => l.innerText = e.target.value);
            updateCalculatedDimensions();
            debouncedRebuild();
        });
    });


    document.querySelectorAll('input[name="format"]').forEach(radio => {
        radio.addEventListener('change', () => {
            const fmt = document.querySelector('input[name="format"]:checked').value;
            const qualityNote = document.getElementById('quality-val');
            if (fmt === 'png') {
                qualityNote.innerText = '无损';
                qualityNote.title = 'PNG 为无损格式，画质滑块不影响体积';
            } else {
                const q = Math.max(1, Math.round(currentQuality * 100));
                qualityNote.innerText = `${q}%`;
                qualityNote.title = '';
            }
            debouncedEncode();
        });
    });


    const handleFiles = (files) => {
        if (!files.length) return;
        filesList = [...filesList, ...Array.from(files)];
        dropZone.classList.add('hidden');
        previewZone.classList.remove('hidden');
        renderQueue();
        selectFile(filesList.length - files.length);
        batchCount.innerText = `${filesList.length} 张`;
        processBtn.innerText = `处理并保存图片`;
    };


    const renderQueue = () => {
        queueContainer.innerHTML = '';
        filesList.forEach((file, index) => {
            const url = URL.createObjectURL(file);
            const thumb = document.createElement('div');
            thumb.className = `batch-thumb nm-flat ${index === currentFileIndex ? 'active' : ''}`;
            thumb.innerHTML = `<img src="${url}" class="w-full h-full object-cover rounded-xl">`;
            thumb.onclick = () => selectFile(index);
            queueContainer.appendChild(thumb);
        });
    };


    const selectFile = (index) => {
        currentFileIndex = index;
        const file = filesList[index];
        const url = URL.createObjectURL(file);


        imgBefore.src = url;
        imgAfter.src = url;


        document.getElementById('orig-size').innerText = (file.size / 1024 / 1024).toFixed(2) + ' MB';


        currentOriginalImageObj = new Image();
        currentOriginalImageObj.onload = () => {
            cropModeBoxPos = { x: 0, y: 0 };
            aspectRatio = currentOriginalImageObj.width / currentOriginalImageObj.height;
            document.getElementById('orig-res').innerText = `${currentOriginalImageObj.width} x ${currentOriginalImageObj.height}`;
            widthInput.value = currentOriginalImageObj.width;
            heightInput.value = currentOriginalImageObj.height;
            updateCalculatedDimensions();
            rebuildPreviewCanvas();
            showCropBtn();
        };
        currentOriginalImageObj.src = url;


        document.querySelectorAll('.batch-thumb').forEach((t, i) => {
            t.classList.toggle('active', i === index);
        });
    };


    dropZone.onclick = () => fileInput.click();
    fileInput.onchange = (e) => handleFiles(e.target.files);


    dropZone.ondragover = (e) => { e.preventDefault(); dropZone.classList.add('nm-flat'); };
    dropZone.ondragleave = () => { dropZone.classList.remove('nm-flat'); };
    dropZone.ondrop = (e) => {
        e.preventDefault();
        dropZone.classList.remove('nm-flat');
        handleFiles(e.dataTransfer.files);
    };


    initComparisonSlider();


    /* ===== 导出处理 ===== */
    processBtn.addEventListener('click', () => {
        if (filesList.length === 0 || !currentOriginalImageObj) {
            alert('请先上传图片！');
            return;
        }


        const originalText = processBtn.innerText;
        processBtn.innerText = '正在渲染并注入 DPI...';
        processBtn.classList.add('nm-inset');


        setTimeout(() => {
            const { w: targetPxW, h: targetPxH } = getTargetPx();


            const canvas = document.createElement('canvas');
            canvas.width = targetPxW;
            canvas.height = targetPxH;
            const ctx = canvas.getContext('2d');


            const formatStr = document.querySelector('input[name="format"]:checked').value;
            if (formatStr === 'jpg') {
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }


            // 使用统一的绘制方法（支持 crop 模式）
            drawImageOnCanvas(ctx, targetPxW, targetPxH, currentOriginalImageObj);


            let mimeType = 'image/jpeg';
            if (formatStr === 'png') mimeType = 'image/png';
            if (formatStr === 'webp') mimeType = 'image/webp';


            let finalDataUrl = canvas.toDataURL(mimeType, currentQuality);


            // DPI 注入 - JPG
            if (formatStr === 'jpg') {
                try {
                    let data = finalDataUrl.replace(/^data:image\/jpeg;base64,/, "");
                    let decoded = atob(data);
                    let length = decoded.length;
                    let buffer = new Uint8Array(length);
                    for (let i = 0; i < length; i++) buffer[i] = decoded.charCodeAt(i);


                    let view = new DataView(buffer.buffer);
                    let offset = 2;
                    while (offset < length) {
                        let marker = view.getUint16(offset, false);
                        let len = view.getUint16(offset + 2, false);
                        if (marker === 0xFFE0) {
                            view.setUint8(offset + 11, 1);
                            view.setUint16(offset + 12, currentDPI, false);
                            view.setUint16(offset + 14, currentDPI, false);
                            break;
                        }
                        offset += 2 + len;
                    }


                    let binary = '';
                    for (let i = 0; i < buffer.byteLength; i++) {
                        binary += String.fromCharCode(buffer[i]);
                    }
                    finalDataUrl = "data:image/jpeg;base64," + btoa(binary);
                } catch (e) {
                    console.error("DPI 注入失败", e);
                }
            }


            // DPI 注入 - PNG
            if (formatStr === 'png') {
                try {
                    let data = finalDataUrl.replace(/^data:image\/png;base64,/, "");
                    let decoded = atob(data);
                    let len = decoded.length;
                    let buffer = new Uint8Array(len);
                    for (let i = 0; i < len; i++) buffer[i] = decoded.charCodeAt(i);


                    const ppm = Math.round(currentDPI / 0.0254);
                    const phys = new Uint8Array(21);
                    const pv = new DataView(phys.buffer);
                    pv.setUint32(0, 9, false);
                    phys[4] = 0x70; phys[5] = 0x48; phys[6] = 0x59; phys[7] = 0x73;
                    pv.setUint32(8, ppm, false);
                    pv.setUint32(12, ppm, false);
                    phys[16] = 1;
                    const crcVal = crc32(phys.slice(4, 17));
                    pv.setUint32(17, crcVal, false);


                    const insertAt = 33;
                    const newBuf = new Uint8Array(buffer.length + 21);
                    newBuf.set(buffer.slice(0, insertAt), 0);
                    newBuf.set(phys, insertAt);
                    newBuf.set(buffer.slice(insertAt), insertAt + 21);


                    let binary = '';
                    for (let i = 0; i < newBuf.byteLength; i++) binary += String.fromCharCode(newBuf[i]);
                    finalDataUrl = "data:image/png;base64," + btoa(binary);
                } catch (e) {
                    console.error("PNG DPI 注入失败", e);
                }
            }


            // DPI 注入 - WebP
            if (formatStr === 'webp') {
                try {
                    let data = finalDataUrl.replace(/^data:image\/webp;base64,/, "");
                    let decoded = atob(data);
                    let len = decoded.length;
                    let buf = new Uint8Array(len);
                    for (let i = 0; i < len; i++) buf[i] = decoded.charCodeAt(i);


                    const exif = new Uint8Array(66);
                    const xv = new DataView(exif.buffer);
                    exif[0] = 0x4D; exif[1] = 0x4D; xv.setUint16(2, 42, false); xv.setUint32(4, 8, false);
                    xv.setUint16(8, 3, false);
                    xv.setUint16(10, 0x011A, false); xv.setUint16(12, 5, false); xv.setUint32(14, 1, false); xv.setUint32(18, 50, false);
                    xv.setUint16(22, 0x011B, false); xv.setUint16(24, 5, false); xv.setUint32(26, 1, false); xv.setUint32(30, 58, false);
                    xv.setUint16(34, 0x0128, false); xv.setUint16(36, 3, false); xv.setUint32(38, 1, false); xv.setUint16(42, 2, false);
                    xv.setUint32(46, 0, false);
                    xv.setUint32(50, currentDPI, false); xv.setUint32(54, 1, false);
                    xv.setUint32(58, currentDPI, false); xv.setUint32(62, 1, false);


                    const exifChunk = new Uint8Array(8 + 66);
                    const ecv = new DataView(exifChunk.buffer);
                    exifChunk[0] = 0x45; exifChunk[1] = 0x58; exifChunk[2] = 0x49; exifChunk[3] = 0x46;
                    ecv.setUint32(4, 66, true);
                    exifChunk.set(exif, 8);


                    const c4 = String.fromCharCode(buf[12], buf[13], buf[14], buf[15]);
                    let newBuf;
                    if (c4 === 'VP8X') {
                        buf[20] |= 0x08;
                        newBuf = new Uint8Array(buf.length + exifChunk.length);
                        newBuf.set(buf, 0);
                        newBuf.set(exifChunk, buf.length);
                    } else {
                        const vp8x = new Uint8Array(18);
                        const vv = new DataView(vp8x.buffer);
                        vp8x[0] = 0x56; vp8x[1] = 0x50; vp8x[2] = 0x38; vp8x[3] = 0x58;
                        vv.setUint32(4, 10, true); vp8x[8] = 0x08;
                        const cw1 = targetPxW - 1, ch1 = targetPxH - 1;
                        vp8x[12] = cw1 & 0xFF; vp8x[13] = (cw1 >> 8) & 0xFF; vp8x[14] = (cw1 >> 16) & 0xFF;
                        vp8x[15] = ch1 & 0xFF; vp8x[16] = (ch1 >> 8) & 0xFF; vp8x[17] = (ch1 >> 16) & 0xFF;
                        const orig = buf.slice(12);
                        newBuf = new Uint8Array(12 + 18 + orig.length + exifChunk.length);
                        newBuf.set(buf.slice(0, 12), 0);
                        newBuf.set(vp8x, 12);
                        newBuf.set(orig, 30);
                        newBuf.set(exifChunk, 30 + orig.length);
                    }
                    const rv = new DataView(newBuf.buffer);
                    rv.setUint32(4, newBuf.length - 8, true);
                    let binary = '';
                    for (let i = 0; i < newBuf.length; i++) binary += String.fromCharCode(newBuf[i]);
                    finalDataUrl = "data:image/webp;base64," + btoa(binary);
                } catch (e) {
                    console.error("WebP DPI 注入失败", e);
                }
            }


            const a = document.createElement('a');
            a.href = finalDataUrl;
            a.download = `NM_Export_${targetPxW}x${targetPxH}_${currentDPI}dpi.${formatStr}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);


            processBtn.classList.remove('nm-inset');
            processBtn.innerText = `保存成功！`;
            setTimeout(() => {
                processBtn.innerText = originalText;
            }, 2000);


        }, 150);
    });


    document.getElementById('add-more-btn').addEventListener('click', () => {
        fileInput.click();
    });


    document.getElementById('clear-all-btn').addEventListener('click', () => {
        filesList = [];
        currentFileIndex = 0;
        currentOriginalImageObj = null;
        previewCanvas = null;
        dropZone.classList.remove('hidden');
        previewZone.classList.add('hidden');
        cropBtn.classList.add('hidden');
        cropModeOverlay.classList.add('hidden');
        imgBefore.src = '';
        imgAfter.src = '';
        queueContainer.innerHTML = '<p class="text-sm text-[#a3b1c6] italic mt-4">未上传</p>';
        batchCount.innerText = '0 张';
        processBtn.innerText = '处理图片';
        document.getElementById('orig-res').innerText = '1920 x 1080';
        document.getElementById('orig-size').innerText = '2.4 MB';
        document.getElementById('target-res').innerText = '1920 x 1080';
        document.getElementById('target-size').innerText = '~500 KB';
    });


    /* ===== 自由裁剪功能（裁剪按钮） ===== */
    const cropBtn = document.getElementById('crop-btn');
    const cropOverlay = document.getElementById('crop-overlay');
    const cropImage = document.getElementById('crop-image');
    const cropSelectionEl = document.getElementById('crop-selection');
    const cropDimLabel = document.getElementById('crop-dim-label');
    let isCropDragging = false;
    let cropStartPos = null;


    const showCropBtn = () => cropBtn.classList.remove('hidden');


    function getContainedRect() {
        const cw = cropOverlay.clientWidth;
        const ch = cropOverlay.clientHeight;
        const nw = currentOriginalImageObj.naturalWidth;
        const nh = currentOriginalImageObj.naturalHeight;
        const scale = Math.min(cw / nw, ch / nh);
        const dw = nw * scale;
        const dh = nh * scale;
        return { ox: (cw - dw) / 2, oy: (ch - dh) / 2, dw, dh, scale };
    }


    function enterCropMode() {
        if (!currentOriginalImageObj) return;
        // 先隐藏尺寸裁剪叠层，避免冲突
        cropModeOverlay.classList.add('hidden');
        cropImage.src = currentOriginalImageObj.src;
        cropOverlay.classList.remove('hidden');
        cropSelectionEl.style.display = 'none';
        cropDimLabel.classList.add('hidden');
    }


    function exitCropMode() {
        cropOverlay.classList.add('hidden');
        cropSelectionEl.style.display = 'none';
        isCropDragging = false;
        // 恢复尺寸裁剪叠层（如果当前是 crop 模式）
        if (resizeMode === 'crop' && currentOriginalImageObj) {
            updateCropModeOverlay();
        }
    }


    cropBtn.addEventListener('click', enterCropMode);


    cropOverlay.addEventListener('mousedown', (e) => {
        if (e.target.closest('#crop-confirm') || e.target.closest('#crop-cancel')) return;
        isCropDragging = true;
        const rect = cropOverlay.getBoundingClientRect();
        cropStartPos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        cropSelectionEl.style.display = 'block';
        cropSelectionEl.style.left = cropStartPos.x + 'px';
        cropSelectionEl.style.top = cropStartPos.y + 'px';
        cropSelectionEl.style.width = '0px';
        cropSelectionEl.style.height = '0px';
    });


    cropOverlay.addEventListener('mousemove', (e) => {
        if (!isCropDragging) return;
        const rect = cropOverlay.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;


        const left = Math.min(cropStartPos.x, x);
        const top = Math.min(cropStartPos.y, y);
        const width = Math.abs(x - cropStartPos.x);
        const height = Math.abs(y - cropStartPos.y);


        cropSelectionEl.style.left = left + 'px';
        cropSelectionEl.style.top = top + 'px';
        cropSelectionEl.style.width = width + 'px';
        cropSelectionEl.style.height = height + 'px';


        const { ox, oy, dw, dh, scale } = getContainedRect();
        const pw = Math.round(width / scale);
        const ph = Math.round(height / scale);
        cropDimLabel.classList.remove('hidden');
        cropDimLabel.innerText = `${pw} × ${ph} px`;
        cropDimLabel.style.left = (left + width + 8) + 'px';
        cropDimLabel.style.top = top + 'px';
    });


    window.addEventListener('mouseup', () => { isCropDragging = false; });


    document.getElementById('crop-confirm').addEventListener('click', () => {
        const sLeft = parseFloat(cropSelectionEl.style.left);
        const sTop = parseFloat(cropSelectionEl.style.top);
        const sW = parseFloat(cropSelectionEl.style.width);
        const sH = parseFloat(cropSelectionEl.style.height);


        if (sW < 5 || sH < 5) { exitCropMode(); return; }


        const { ox, oy, dw, dh, scale } = getContainedRect();


        let sx = Math.max(0, (sLeft - ox)) / scale;
        let sy = Math.max(0, (sTop - oy)) / scale;
        let sw = sW / scale;
        let sh = sH / scale;
        const natW = currentOriginalImageObj.naturalWidth;
        const natH = currentOriginalImageObj.naturalHeight;
        sx = Math.min(sx, natW); sy = Math.min(sy, natH);
        sw = Math.min(sw, natW - sx); sh = Math.min(sh, natH - sy);
        if (sw < 1 || sh < 1) { exitCropMode(); return; }


        const c = document.createElement('canvas');
        c.width = Math.round(sw);
        c.height = Math.round(sh);
        c.getContext('2d').drawImage(currentOriginalImageObj, sx, sy, sw, sh, 0, 0, c.width, c.height);


        const croppedUrl = c.toDataURL('image/png');
        const newImg = new Image();
        newImg.onload = () => {
            currentOriginalImageObj = newImg;
            imgBefore.src = croppedUrl;
            aspectRatio = newImg.width / newImg.height;
            widthInput.value = newImg.width;
            heightInput.value = newImg.height;
            cropModeBoxPos = { x: 0, y: 0 };
            document.getElementById('orig-res').innerText = `${newImg.width} × ${newImg.height}`;
            updateCalculatedDimensions();
            rebuildPreviewCanvas();
        };
        newImg.src = croppedUrl;


        exitCropMode();
    });


    document.getElementById('crop-cancel').addEventListener('click', exitCropMode);


    /* ===== 尺寸裁剪模式（缩放/裁剪切换） ===== */
    const modeScaleBtn = document.getElementById('mode-scale');
    const modeCropModeBtn = document.getElementById('mode-crop-btn');
    const cropModeOverlay = document.getElementById('crop-mode-overlay');
    const cropModeImg = document.getElementById('crop-mode-img');
    const cropModeBox = document.getElementById('crop-mode-box');
    const cropModeLabel = document.getElementById('crop-mode-label');


    const setResizeMode = (mode) => {
        resizeMode = mode;
        if (mode === 'scale') {
            modeScaleBtn.className = 'nm-inset rounded-xl px-4 py-2 text-xs font-bold text-[#6366f1] transition-all';
            modeCropModeBtn.className = 'nm-flat rounded-xl px-4 py-2 text-xs font-bold text-[#44475a] transition-all';
            cropModeOverlay.classList.add('hidden');
        } else {
            modeCropModeBtn.className = 'nm-inset rounded-xl px-4 py-2 text-xs font-bold text-[#6366f1] transition-all';
            modeScaleBtn.className = 'nm-flat rounded-xl px-4 py-2 text-xs font-bold text-[#44475a] transition-all';
            updateCropModeOverlay();
        }
        debouncedRebuild();
    };


    modeScaleBtn.addEventListener('click', () => setResizeMode('scale'));
    modeCropModeBtn.addEventListener('click', () => {
        if (!currentOriginalImageObj) return;
        setResizeMode('crop');
    });


    const updateCropModeOverlay = () => {
        if (resizeMode !== 'crop' || !currentOriginalImageObj) return;
        cropModeImg.src = currentOriginalImageObj.src;
        cropModeOverlay.classList.remove('hidden');


        const natW = currentOriginalImageObj.naturalWidth;
        const natH = currentOriginalImageObj.naturalHeight;
        const { w: tw, h: th } = getTargetPx();


        // 裁剪框不能超过原图
        let boxW = Math.min(tw, natW);
        let boxH = Math.min(th, natH);
        if (tw > natW || th > natH) {
            const s = Math.min(natW / tw, natH / th);
            boxW = Math.round(tw * s);
            boxH = Math.round(th * s);
        }


        cropModeBoxPos.x = Math.max(0, Math.min(cropModeBoxPos.x, natW - boxW));
        cropModeBoxPos.y = Math.max(0, Math.min(cropModeBoxPos.y, natH - boxH));


        const cw = cropModeOverlay.clientWidth;
        const ch = cropModeOverlay.clientHeight;
        const scale = Math.min(cw / natW, ch / natH);
        const ox = (cw - natW * scale) / 2;
        const oy = (ch - natH * scale) / 2;


        const dl = ox + cropModeBoxPos.x * scale;
        const dt = oy + cropModeBoxPos.y * scale;
        const dw = boxW * scale;
        const dh = boxH * scale;


        cropModeBox.style.left = dl + 'px';
        cropModeBox.style.top = dt + 'px';
        cropModeBox.style.width = dw + 'px';
        cropModeBox.style.height = dh + 'px';


        cropModeLabel.style.left = dl + 'px';
        cropModeLabel.style.top = Math.max(0, dt - 22) + 'px';
        cropModeLabel.innerText = `${boxW} × ${boxH} px`;
    };


    let isCropModeDragging = false;
    let cropModeDragStart = null;
    let cropModeStartPos = null;


    cropModeBox.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        isCropModeDragging = true;
        cropModeDragStart = { x: e.clientX, y: e.clientY };
        cropModeStartPos = { ...cropModeBoxPos };
    });


    window.addEventListener('mousemove', (e) => {
        if (!isCropModeDragging || !currentOriginalImageObj) return;
        const natW = currentOriginalImageObj.naturalWidth;
        const natH = currentOriginalImageObj.naturalHeight;
        const cw = cropModeOverlay.clientWidth;
        const ch = cropModeOverlay.clientHeight;
        const scale = Math.min(cw / natW, ch / natH);


        const dx = (e.clientX - cropModeDragStart.x) / scale;
        const dy = (e.clientY - cropModeDragStart.y) / scale;


        const { w: tw, h: th } = getTargetPx();
        let boxW = Math.min(tw, natW);
        let boxH = Math.min(th, natH);
        if (tw > natW || th > natH) {
            const s = Math.min(natW / tw, natH / th);
            boxW = Math.round(tw * s);
            boxH = Math.round(th * s);
        }


        cropModeBoxPos.x = Math.max(0, Math.min(cropModeStartPos.x + dx, natW - boxW));
        cropModeBoxPos.y = Math.max(0, Math.min(cropModeStartPos.y + dy, natH - boxH));
        updateCropModeOverlay();
        debouncedRebuild();
    });


    window.addEventListener('mouseup', () => { isCropModeDragging = false; });
});
