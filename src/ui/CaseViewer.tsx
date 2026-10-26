// 3D preview of the printable case (three.js): base, lid (exploded or closed) and the board inside.
import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { CASE_DIMS } from '../core/enclosure';
import { Button } from './ds';

export function CaseViewer({ jobId, files, outer, board, style = 'rounded' }: { jobId: string; files: string[]; outer: { w: number; d: number; h: number }; board: { w: number; d: number }; style?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [exploded, setExploded] = useState(true);
  const lidRef = useRef<THREE.Mesh | null>(null);

  useEffect(() => {
    const el = host.current!;
    const w = el.clientWidth;
    const h = Math.max(320, Math.round(w * 0.6));
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.setSize(w, h);
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#e9ece8');
    const camera = new THREE.PerspectiveCamera(35, w / h, 1, 2000);
    const span = Math.max(outer.w, outer.d, outer.h * 2);
    camera.up.set(0, 0, 1);
    const stand = style === 'desk-stand';
    // Wall-mount: look from underneath so the keyhole slots in the floor are visible.
    if (style === 'wall-mount') camera.position.set(outer.w * 1.2, -outer.d * 1.1, -span * 1.3);
    else camera.position.set(outer.w * (stand ? 2.2 : 1.4), -outer.d * 1.6, span * 1.5);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(stand ? outer.w : outer.w / 2, outer.d / 2, outer.h / 2);
    controls.update();
    scene.add(new THREE.HemisphereLight('#ffffff', '#8a8f8c', 1.6));
    const sun = new THREE.DirectionalLight('#ffffff', 1.6);
    sun.position.set(outer.w, -outer.d, span * 2);
    scene.add(sun);
    // The circuit board, for scale.
    const pcb = new THREE.Mesh(new THREE.BoxGeometry(board.w, board.d, CASE_DIMS.PCB), new THREE.MeshStandardMaterial({ color: '#2d6b3c' }));
    pcb.position.set(CASE_DIMS.WALL + CASE_DIMS.GAP + board.w / 2, CASE_DIMS.WALL + CASE_DIMS.GAP + board.d / 2, CASE_DIMS.FLOOR + CASE_DIMS.STANDOFF + CASE_DIMS.PCB / 2);
    scene.add(pcb);
    const loader = new STLLoader();
    const url = (f: string) => `/api/pcb/file?id=${jobId}&path=${encodeURIComponent(f)}`;
    let stopped = false;
    for (const f of files.filter((x) => /(case-(base|lid)|desk-stand)\.stl$/.test(x))) {
      loader.load(url(f), (geom) => {
        if (stopped) return;
        geom.computeVertexNormals();
        const isLid = /case-lid\.stl$/.test(f);
        if (isLid) {
          // The lid is exported upside down for printing: turn it back over.
          geom.rotateX(Math.PI);
          geom.translate(0, outer.d, CASE_DIMS.LID);
        }
        const isStand = /(^|\/)desk-stand\.stl$/.test(f);
        // The stand is exported beside the case; leave a small gap so both are easy to see.
        if (isStand) {
          geom.computeBoundingBox();
          const bb = geom.boundingBox!;
          geom.translate(outer.w + 15 - bb.min.x, -bb.min.y, -bb.min.z);
        }
        const mesh = new THREE.Mesh(geom, new THREE.MeshStandardMaterial({ color: isLid ? '#f2f2ee' : isStand ? '#d8b98a' : '#c9d3dc', roughness: 0.8, transparent: isLid, opacity: isLid ? 0.92 : 1, side: THREE.DoubleSide }));
        if (isLid) {
          mesh.position.z = outer.h - CASE_DIMS.LID + 30;
          lidRef.current = mesh;
        }
        scene.add(mesh);
      });
    }
    let raf = 0;
    const loop = () => {
      const lid = lidRef.current;
      if (lid) {
        const target = outer.h - CASE_DIMS.LID + ((el as any).__exploded ? 30 : 0);
        lid.position.z += (target - lid.position.z) * 0.2;
      }
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      controls.dispose();
      renderer.dispose();
      el.removeChild(renderer.domElement);
    };
  }, [jobId, files.join('|'), style]);

  useEffect(() => {
    if (host.current) (host.current as any).__exploded = exploded;
  }, [exploded]);

  return (
    <div className="case-viewer" data-testid="case-viewer">
      <div ref={host} className="case-canvas" />
      <div className="case-viewer-tools">
        <Button onClick={() => setExploded((x) => !x)}>{exploded ? 'Close the lid' : 'Open the lid'}</Button>
        <span className="muted">{style === 'wall-mount' ? 'Seen from below: the two keyhole slots hang on wall screws. ' : style === 'desk-stand' ? 'The tan wedge beside it is the desk stand. ' : ''}Drag to turn it, scroll to zoom.</span>
      </div>
    </div>
  );
}
