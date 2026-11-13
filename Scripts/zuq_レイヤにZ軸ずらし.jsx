(function () {
    var CAM_NAME = "depCam";
    var DEPTH_NAME = "depth";
    var AMP_NAME = "depth_amp";

    var comp = app.project.activeItem;
    if (!(comp instanceof CompItem) || comp.selectedLayers.length === 0) {
        alert("コンポジションでレイヤーを選択してから実行してください。");
        return;
    }
    var layers = comp.selectedLayers;
    app.beginUndoGroup("depCam セットアップ");

    var cam = null;
    for (var i = 1; i <= comp.numLayers; i++) {
        if (comp.layer(i).name === CAM_NAME) cam = comp.layer(i);
    }
    if (!cam) {
        var top = layers[0];
        var inPoint = top.inPoint;
        var outPoint = top.outPoint;
        for (var n = 1; n < layers.length; n++) {
            if (layers[n].index < top.index) top = layers[n];
            inPoint = Math.min(inPoint, layers[n].inPoint);
            outPoint = Math.max(outPoint, layers[n].outPoint);
        }
        cam = comp.layers.addNull();
        cam.name = CAM_NAME;
        cam.moveBefore(top);
        cam.inPoint = inPoint;
        cam.outPoint = outPoint;
        cam.threeDLayer = true;
        var ampSlider = cam.property("ADBE Effect Parade").addProperty("ADBE Slider Control");
        ampSlider.name = AMP_NAME;
        ampSlider.property(1).setValue(100);
    }
    var amp = cam.property("ADBE Effect Parade").property(AMP_NAME).property(1).value / 100;
    var anchor = cam.property("ADBE Transform Group").property("ADBE Anchor Point").value;

    var D = comp.activeCamera
        ? comp.activeCamera.property("ADBE Camera Options Group").property("ADBE Camera Zoom").value
        : comp.width * 25 / 18;

    var MARK = "// depCam";
    var kExpr =
        'var z = effect("' + DEPTH_NAME + '")(1) * thisComp.layer("' + CAM_NAME + '").effect("' + AMP_NAME + '")(1) / 100;\n' +
        'var D;\n' +
        'try { D = thisComp.activeCamera.cameraOption.zoom; } catch (e) { D = thisComp.width * 25 / 18; }\n' +
        'var k = (D + z) / D;\n' +
        'var c = thisComp.layer("' + CAM_NAME + '").transform.anchorPoint;\n';

    function applyExpr(prop, body) {
        var orig = prop.expression;
        var lines = orig.split("\n");
        if (lines[0] === MARK) orig = lines[1] === "var base = value;" ? "" : eval(lines[1].slice(16, -2));
        else if (orig.indexOf('effect("' + DEPTH_NAME + '")') !== -1) orig = "";
        var base = orig
            ? 'eval("' + orig.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r/g, "\\r").replace(/\n/g, "\\n") + '")'
            : "value";
        prop.expression = MARK + "\nvar base = " + base + ";\n" + kExpr + body;
    }

    for (var j = 0; j < layers.length; j++) {
        var layer = layers[j];
        if (layer === cam || layer instanceof CameraLayer || layer instanceof LightLayer) continue;
        layer.threeDLayer = true;
        if (layer.parent !== cam) layer.parent = cam;

        var tf = layer.property("ADBE Transform Group");
        var sep = tf.property("ADBE Position").dimensionsSeparated;

        if (!layer.property("ADBE Effect Parade").property(DEPTH_NAME)) {
            var t = comp.time;
            var p = sep
                ? [tf.property("ADBE Position_0").valueAtTime(t, true), tf.property("ADBE Position_1").valueAtTime(t, true), tf.property("ADBE Position_2").valueAtTime(t, true)]
                : tf.property("ADBE Position").valueAtTime(t, true);
            var s = tf.property("ADBE Scale").valueAtTime(t, true);
            var depthSlider = layer.property("ADBE Effect Parade").addProperty("ADBE Slider Control");
            depthSlider.name = DEPTH_NAME;
            depthSlider.property(1).setValue(p[2] / amp);

            tf = layer.property("ADBE Transform Group");
            var k = (D + p[2]) / D;
            var b = [anchor[0] + (p[0] - anchor[0]) / k, anchor[1] + (p[1] - anchor[1]) / k, p[2]];
            if (sep) {
                for (var d = 0; d < 3; d++) {
                    if (tf.property("ADBE Position_" + d).numKeys === 0) tf.property("ADBE Position_" + d).setValue(b[d]);
                }
            } else if (tf.property("ADBE Position").numKeys === 0) {
                tf.property("ADBE Position").setValue(b);
            }
            if (tf.property("ADBE Scale").numKeys === 0) tf.property("ADBE Scale").setValue([s[0] / k, s[1] / k, s[2] / k]);
        }

        if (sep) {
            applyExpr(tf.property("ADBE Position_0"), "c[0] + (base - c[0]) * k;");
            applyExpr(tf.property("ADBE Position_1"), "c[1] + (base - c[1]) * k;");
            applyExpr(tf.property("ADBE Position_2"), "z;");
        } else {
            applyExpr(tf.property("ADBE Position"), "[c[0] + (base[0] - c[0]) * k, c[1] + (base[1] - c[1]) * k, z];");
        }
        applyExpr(tf.property("ADBE Scale"), "base * k;");
    }

    app.endUndoGroup();
})();
