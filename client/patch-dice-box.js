const fs = require('fs');
const path = require('path');

const targetDir = path.join(__dirname, 'node_modules', '@3d-dice', 'dice-box', 'dist');

const filesToPatch = [
  {
    name: 'world.onscreen.js',
    search: `r.Vertex_Definitions(\`
      attribute vec3 customColor;
      varying vec3 vColor;
    \`).Vertex_MainEnd(\`
      vColor = customColor;
    \`).Fragment_Definitions(\`
      varying vec3 vColor;
    \`).Fragment_Custom_Diffuse(\`
      baseColor.rgb = mix(vColor.rgb, baseColor.rgb, baseColor.a);
    \`), r.AddAttribute("customColor");
    const n = r.clone(t + "_dark");
    i.diffuseTexture && i.diffuseTexture.dark && (s.material.diffuseTexture = e.material.diffuseTexture.dark, n.diffuseTexture = await this.getTexture("diffuse", s)), n.AddAttribute("customColor");`,
    replace: `r.Vertex_Definitions(\`
      attribute vec3 customColor;
      varying vec3 vColor;
    \`).Vertex_MainEnd(\`
      vColor = customColor;
    \`).Fragment_Definitions(\`
      varying vec3 vColor;
    \`).Fragment_Custom_Diffuse(\`
      baseColor.rgb = mix(vColor.rgb * baseColor.rgb, baseColor.rgb, baseColor.a);
    \`);
    if (i.alpha !== undefined) r.alpha = i.alpha;
    if (i.backFaceCulling !== undefined) r.backFaceCulling = i.backFaceCulling;
    if (i.alpha !== undefined && i.alpha < 1.0) {
      r.Fragment_Custom_Alpha(\`
        alpha = mix(\` + i.alpha + \`, 1.0, baseColor.a);
      \`);
    }
    r.AddAttribute("customColor");
    const n = r.clone(t + "_dark");
    if (i.alpha !== undefined) n.alpha = i.alpha;
    if (i.backFaceCulling !== undefined) n.backFaceCulling = i.backFaceCulling;
    i.diffuseTexture && i.diffuseTexture.dark && (s.material.diffuseTexture = e.material.diffuseTexture.dark, n.diffuseTexture = await this.getTexture("diffuse", s)), n.AddAttribute("customColor");`
  },
  {
    name: 'world.onscreen.min.js',
    search: `s.allowShaderHotSwapping=!1,s.Vertex_Definitions(\`
      attribute vec3 customColor;
      varying vec3 vColor;
    \`).Vertex_MainEnd(\`
      vColor = customColor;
    \`).Fragment_Definitions(\`
      varying vec3 vColor;
    \`).Fragment_Custom_Diffuse(\`
      baseColor.rgb = mix(vColor.rgb, baseColor.rgb, baseColor.a);
    \`),s.AddAttribute("customColor");const a=s.clone(t+"_dark");i.diffuseTexture&&i.diffuseTexture.dark&&(r.material.diffuseTexture=e.material.diffuseTexture.dark,a.diffuseTexture=await this.getTexture("diffuse",r)),a.AddAttribute("customColor")`,
    replace: `s.allowShaderHotSwapping=!1;if(i.alpha!==undefined)s.alpha=i.alpha;if(i.backFaceCulling!==undefined)s.backFaceCulling=i.backFaceCulling;s.Vertex_Definitions(\`
      attribute vec3 customColor;
      varying vec3 vColor;
    \`).Vertex_MainEnd(\`
      vColor = customColor;
    \`).Fragment_Definitions(\`
      varying vec3 vColor;
    \`).Fragment_Custom_Diffuse(\`
      baseColor.rgb = mix(vColor.rgb * baseColor.rgb, baseColor.rgb, baseColor.a);
    \`);if(i.alpha!==undefined&&i.alpha<1.0){s.Fragment_Custom_Alpha(\`
         alpha = mix(\` + i.alpha + \`, 1.0, baseColor.a);
       \`)}s.AddAttribute("customColor");const a=s.clone(t+"_dark");if(i.alpha!==undefined)a.alpha=i.alpha;if(i.backFaceCulling!==undefined)a.backFaceCulling=i.backFaceCulling;i.diffuseTexture&&i.diffuseTexture.dark&&(r.material.diffuseTexture=e.material.diffuseTexture.dark,a.diffuseTexture=await this.getTexture("diffuse",r)),a.AddAttribute("customColor")`
  },
  {
    name: 'dice-box.es.js',
    search: `  resizeWorld() {
    const b = pl(() => {
      W(this, u).resize({ width: this.canvas.clientWidth, height: this.canvas.clientHeight }), W(this, p) && W(this, p).postMessage({ action: "resize", width: this.canvas.clientWidth, height: this.canvas.clientHeight });
    });
    window.addEventListener("resize", b);
  }`,
    replace: `  resizeWorld() {
    const b = pl(() => {
      if (!this.canvas) return;
      W(this, u).resize({ width: this.canvas.clientWidth, height: this.canvas.clientHeight }), W(this, p) && W(this, p).postMessage({ action: "resize", width: this.canvas.clientWidth, height: this.canvas.clientHeight });
    });
    window.addEventListener("resize", b);
  }`
  },
  {
    name: 'dice-box.es.js',
    search: `  hide(l) {
    return l ? (this.canvas.dataset.hideClass = l, this.canvas.classList.add(l)) : this.canvas.style.display = "none", this.isVisible = !1, this;
  }
  show() {
    var b;
    const l = (b = this.canvas.dataset) == null ? void 0 : b.hideClass;
    return l ? (delete this.canvas.dataset.hideClass, this.canvas.classList.remove(l)) : this.canvas.style.display = "block", this.isVisible = !0, this.resizeWorld(), this;
  }`,
    replace: `  hide(l) {
    if (!this.canvas) return this;
    return l ? (this.canvas.dataset.hideClass = l, this.canvas.classList.add(l)) : this.canvas.style.display = "none", this.isVisible = !1, this;
  }
  show() {
    if (!this.canvas) return this;
    var b;
    const l = (b = this.canvas.dataset) == null ? void 0 : b.hideClass;
    return l ? (delete this.canvas.dataset.hideClass, this.canvas.classList.remove(l)) : this.canvas.style.display = "block", this.isVisible = !0, this.resizeWorld(), this;
  }`
  },
  {
    name: 'dice-box.es.min.js',
    search: `resizeWorld(){const l=il(()=>{W(this,u).resize({width:this.canvas.clientWidth,height:this.canvas.clientHeight}),W(this,h)&&W(this,h).postMessage({action:"resize",width:this.canvas.clientWidth,height:this.canvas.clientHeight})});window.addEventListener("resize",l)}`,
    replace: `resizeWorld(){const l=il(()=>{if(!this.canvas)return;W(this,u).resize({width:this.canvas.clientWidth,height:this.canvas.clientHeight}),W(this,h)&&W(this,h).postMessage({action:"resize",width:this.canvas.clientWidth,height:this.canvas.clientHeight})});window.addEventListener("resize",l)}`
  },
  {
    name: 'dice-box.es.min.js',
    search: `hide(l){return l?(this.canvas.dataset.hideClass=l,this.canvas.classList.add(l)):this.canvas.style.display="none",this.isVisible=!1,this}show(){var l;const b=(l=this.canvas.dataset)==null?void 0:l.hideClass;return b?(delete this.canvas.dataset.hideClass,this.canvas.classList.remove(b)):this.canvas.style.display="block",this.isVisible=!0,this.resizeWorld(),this}`,
    replace: `hide(l){if(!this.canvas)return this;return l?(this.canvas.dataset.hideClass=l,this.canvas.classList.add(l)):this.canvas.style.display="none",this.isVisible=!1,this}show(){if(!this.canvas)return this;var l;const b=(l=this.canvas.dataset)==null?void 0:l.hideClass;return b?(delete this.canvas.dataset.hideClass,this.canvas.classList.remove(b)):this.canvas.style.display="block",this.isVisible=!0,this.resizeWorld(),this}`
  }
];

function patchFile(fileInfo) {
  const filePath = path.join(targetDir, fileInfo.name);
  if (!fs.existsSync(filePath)) {
    console.warn(`[DiceBox Patch] File not found: ${filePath}`);
    return;
  }

  const content = fs.readFileSync(filePath, 'utf8');
  if (content.includes(fileInfo.replace)) {
    console.log(`[DiceBox Patch] ${fileInfo.name} is already patched.`);
    return;
  }

  if (!content.includes(fileInfo.search)) {
    console.error(`[DiceBox Patch] Unable to locate target search block in ${fileInfo.name}!`);
    return;
  }

  const newContent = content.replace(fileInfo.search, fileInfo.replace);
  fs.writeFileSync(filePath, newContent, 'utf8');
  console.log(`[DiceBox Patch] Successfully patched ${fileInfo.name}.`);
}

console.log('[DiceBox Patch] Running patches...');
try {
  filesToPatch.forEach(patchFile);
} catch (err) {
  console.error('[DiceBox Patch] Failed to apply patches:', err);
}
