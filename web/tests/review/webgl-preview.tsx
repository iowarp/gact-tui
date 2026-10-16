import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import '../../src/index.css';
import { HtmlFilePreview } from '../../src/components/clio/html-file-preview';
import { HtmlRendererFrame } from '../../src/components/clio/desktop-html-frame';
import { interactiveHtmlDocument } from '../../src/components/clio/html-interactive-policy';
import desktopConfig from '../../../desktop/src-tauri/tauri.conf.json';

const source = `<!doctype html><html><head><style>
html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#051d2c;color:white;font:16px system-ui}
#controls{position:absolute;top:22px;left:24px;z-index:2}h1{margin:0 0 8px}label{display:block;margin-top:12px}canvas{display:block}
</style></head><body><div id="controls"><h1>Sea surface</h1><p>Offline Three.js · animated WebGL</p><label>Wave height <input id="height" type="range" min="0" max="2" step="0.1" value="0.8"></label><output id="result">Starting…</output></div><script type="module">
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,2));document.body.append(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color('#051d2c');scene.fog=new THREE.Fog('#051d2c',12,40);
const camera=new THREE.PerspectiveCamera(45,innerWidth/innerHeight,0.1,100);camera.position.set(10,8,12);
const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;
scene.add(new THREE.HemisphereLight(0xb6f5ff,0x083055,3));const light=new THREE.DirectionalLight(0xffd9a0,4);light.position.set(-5,10,5);scene.add(light);
const geometry=new THREE.PlaneGeometry(30,30,90,90);geometry.rotateX(-Math.PI/2);const points=geometry.attributes.position;
const ocean=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:0x00a9ba,metalness:0.45,roughness:0.26,side:THREE.DoubleSide}));scene.add(ocean);
let frame=0;const started=performance.now();const height=document.getElementById('height');
function animate(){const t=(performance.now()-started)/1000;for(let i=0;i<points.count;i++){const x=points.getX(i),z=points.getZ(i);points.setY(i,Number(height.value)*(Math.sin(x*0.8+t*1.6)*0.45+Math.cos(z*0.65-t)*0.35));}points.needsUpdate=true;geometry.computeVertexNormals();controls.update();renderer.render(scene,camera);document.getElementById('result').textContent='WebGL running · frame '+(++frame)+' · height '+height.value;requestAnimationFrame(animate);}animate();
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
</script></body></html>`;

function DesktopPolicyPreview() {
  const [html, setHtml] = useState('');
  useEffect(() => {
    const policy = document.createElement('meta');
    policy.httpEquiv = 'Content-Security-Policy';
    policy.content = desktopConfig.app.security.csp;
    document.head.append(policy);
    void interactiveHtmlDocument(source).then(setHtml);
    return () => policy.remove();
  }, []);
  return html ? (
    <HtmlRendererFrame
      name="sea.html"
      html={html}
      url={
        new URLSearchParams(location.search).get('renderer-url') ??
        'http://127.0.0.1:8198/v1/html-renderer'
      }
    />
  ) : (
    <p>Loading Desktop policy preview…</p>
  );
}

createRoot(document.getElementById('root')!).render(
  <main className="h-screen bg-background p-4">
    <div className="h-full overflow-hidden rounded-xl border">
      {new URLSearchParams(location.search).has('desktop-policy') ? (
        <DesktopPolicyPreview />
      ) : (
        <HtmlFilePreview name="sea.html" content={source} />
      )}
    </div>
  </main>,
);
