/* ══════════════════════════════════════════════════════════════════
   Lapisan antarmuka v3: dock 7 tab, inspektur 3 tab, sub-tab, peta SVG.

   Diekstrak dari <script> inline di index.html. Server mengirim
   Content-Security-Policy: script-src 'self', sehingga skrip inline
   ditolak peramban dan tidak satu pun bagian ini berjalan.

   Jangan dikembalikan ke inline. Bila berkas ini diubah, versi cache
   pada server.js (ASSET_FILES) menyesuaikan sendiri lewat hash.
   ══════════════════════════════════════════════════════════════════ */

/* ── blok asli 1 dari index.html ── */
(function () {
// Audit v3 — dock 7 tabs + inspector 3 tabs + sub-tabs
(function(){
  // inspector seg
  const itabs=[...document.querySelectorAll('.seg [role="tab"]')];
  function iselect(i,focus){
    itabs.forEach((t,j)=>{
      const on=i===j;
      t.setAttribute("aria-selected",String(on)); t.tabIndex=on?0:-1;
      const panel=document.getElementById(t.getAttribute("aria-controls"));
      if(panel) panel.hidden=!on;
    });
    if(focus) itabs[i].focus();
  }
  itabs.forEach((t,i)=>{
    t.addEventListener("click",()=>iselect(i));
    t.addEventListener("keydown",e=>{
      const k=e.key;
      if(k==="ArrowRight"||k==="ArrowLeft"){e.preventDefault();iselect((i+(k==="ArrowRight"?1:2))%3,true);}
      if(k==="Home"){e.preventDefault();iselect(0,true);} if(k==="End"){e.preventDefault();iselect(2,true);}
    });
  });

  // dock tabs
  const dtabs=[...document.querySelectorAll(".dock-tab")];
  function dselect(i,focus){
    dtabs.forEach((t,j)=>{
      const on=i===j;
      t.setAttribute("aria-selected",String(on)); t.tabIndex=on?0:-1;
      const id=t.getAttribute("aria-controls");
      const panel=document.getElementById(id);
      if(panel){ panel.hidden=!on; panel.classList.toggle("on",on); }
    });
    const dock=document.getElementById("dock");
    if(dock){ dock.classList.remove("collapsed"); }
    const toggle=document.getElementById("dockToggle");
    if(toggle) toggle.setAttribute("aria-expanded","true");
    if(focus) dtabs[i].focus();
    // resize map if needed
    if(window.map && window.map.invalidateSize) setTimeout(()=>window.map.invalidateSize(), 180);
  }
  dtabs.forEach((t,i)=>{
    t.addEventListener("click",()=>dselect(i));
    t.addEventListener("keydown",e=>{
      const k=e.key;
      if(k==="ArrowRight"||k==="ArrowLeft"){e.preventDefault();dselect((i+(k==="ArrowRight"?1:dtabs.length-1))%dtabs.length,true);}
      if(k==="Home"){e.preventDefault();dselect(0,true);} if(k==="End"){e.preventDefault();dselect(dtabs.length-1,true);}
    });
  });
  const dockToggle=document.getElementById("dockToggle");
  if(dockToggle){
    dockToggle.addEventListener("click",()=>{
      const d=document.getElementById("dock");
      if(!d) return;
      const c=d.classList.toggle("collapsed");
      dockToggle.setAttribute("aria-expanded",String(!c));
      if(window.map && window.map.invalidateSize) setTimeout(()=>window.map.invalidateSize(), 240);
    });
  }

  // sub-tabs inside dock (Wilayah & Atribusi)
  document.querySelectorAll(".subtabs").forEach(g=>{
    const bs=[...g.querySelectorAll('[role="tab"]')];
    bs.forEach((b,i)=>{
      b.addEventListener("click",()=>{
        bs.forEach((x,j)=>{
          x.setAttribute("aria-selected",String(i===j));
          const sub=document.getElementById(x.dataset.sub);
          if(sub) sub.classList.toggle("on",i===j);
          // legacy pane handling for compatibility
          if(x.dataset.sub && x.dataset.sub.startsWith("w-")){
            const map={"w-terdampak":"paneImpact","w-provinsi":"paneProv","w-abu":"paneAsh","w-klaster":"paneCluster","w-kering":"paneDry"};
            const target=map[x.dataset.sub];
            if(target){
              document.querySelectorAll("#paneImpact,#paneProv,#paneAsh,#paneCluster,#paneDry").forEach(p=>p.hidden=true);
              const el=document.getElementById(target);
              if(el) el.hidden=false;
            }
          }
          if(x.dataset.sub && x.dataset.sub.startsWith("a-")){
            const map2={"a-unit":"paneUnit","a-grup":"paneGroup"};
            const target=map2[x.dataset.sub];
            if(target){
              document.querySelectorAll("#paneUnit,#paneGroup").forEach(p=>p.hidden=true);
              const el=document.getElementById(target);
              if(el) el.hidden=false;
            }
          }
        });
      });
    });
  });

  // switch role=switch click
  document.addEventListener("click",e=>{
    const sw=e.target.closest(".switch");
    if(sw) sw.setAttribute("aria-checked", sw.getAttribute("aria-checked")==="true"?"false":"true");
  });

  // Ensure initial state
  if(itabs.length) iselect(0);
  if(dtabs.length) dselect(0);
})();
})();

/* ── blok asli 2 dari index.html ── */
(function () {
// Map SVG — adopted from prototipe v3
const HEAT = "3,868.1,268.8;4,898.6,251.7;2,940.6,297.5;3,929.4,251.6;4,892.0,262.3;2,927.3,326.4;4,912.2,273.4;4,891.3,280.1;4,893.2,278.6;3,888.2,253.3;3,924.3,265.0;3,882.6,260.2;3,887.4,279.5;2,887.7,244.3;1,905.0,222.4;3,883.1,252.9;2,943.1,310.5;4,886.5,281.8;4,922.1,282.6;4,924.8,260.8;4,909.2,281.6;4,922.2,281.0;4,921.7,275.5;3,888.4,262.0;4,928.5,292.3;2,870.6,244.9;4,927.6,274.4;3,927.2,303.7;3,866.5,252.2;4,942.6,261.8;2,863.2,237.2;3,872.9,254.6;4,905.0,267.8;4,933.3,269.6;2,938.9,241.7;2,933.8,312.2;3,928.9,304.3;4,908.0,304.5;3,926.2,253.9;3,873.8,269.1;4,914.4,275.3;4,893.0,258.1;3,931.3,282.5;4,943.0,284.0;3,877.6,264.9;4,894.7,265.7;4,895.0,282.0;4,924.9,268.2;4,914.6,302.0;4,911.8,293.5;3,897.8,259.4;2,865.9,244.8;2,943.3,230.0;4,910.8,250.3;3,922.0,246.8;4,916.3,286.4;4,905.7,277.1;3,874.9,270.1;3,913.4,304.4;4,921.6,267.6;2,873.8,261.0;4,911.5,286.2;4,907.6,294.7;4,893.1,284.5;4,922.4,301.4;3,897.3,255.8;4,920.5,251.4;2,871.2,240.0;4,923.3,298.5;4,917.4,282.8;3,907.4,238.4;2,871.4,245.0;4,895.4,278.1;3,895.1,307.5;4,909.6,289.5;4,911.6,267.7;2,865.4,264.6;4,915.4,282.3;4,895.4,272.5;4,903.4,279.8;4,883.4,276.0;4,919.3,274.4;2,895.7,308.4;4,874.3,271.1;4,926.6,271.2;2,871.3,254.1;4,909.3,265.7;3,935.1,304.9;3,894.8,299.0;3,911.6,245.1;3,929.2,252.5;3,870.5,258.7;4,891.7,269.0;4,886.8,284.3;3,898.9,313.4;4,898.0,288.7;4,904.5,264.6;3,931.3,259.6;4,889.6,283.3;4,924.0,254.0;4,908.1,305.2;4,910.6,294.0;4,909.2,302.2;3,903.9,232.8;1,837.9,257.3;3,913.1,305.9;2,920.0,240.0;4,916.2,262.6;3,897.7,245.2;3,925.8,246.5;4,897.5,282.0;4,912.1,253.5;4,908.1,287.7;4,940.4,269.7;4,935.0,286.1;4,921.4,286.8;2,867.3,265.9;4,889.0,267.2;4,919.5,261.8;4,940.7,282.6;3,879.1,263.3;4,931.0,267.1;4,904.3,258.2;4,933.0,296.1;3,879.9,256.8;4,928.3,258.1;4,890.4,276.4;3,942.7,257.2;1,857.2,243.3;3,879.0,273.7;4,907.3,281.8;4,925.7,256.4;4,905.3,261.0;4,912.2,287.0;4,881.2,268.6;4,898.7,270.1;4,914.0,274.7;3,898.3,310.4;2,868.3,247.9;3,930.7,319.9;3,925.6,261.3;4,905.1,282.6;3,939.0,290.0;3,929.8,260.3;3,884.3,265.7;4,902.1,268.2;3,910.2,312.0;4,912.4,250.7;3,940.5,295.4;4,936.9,264.4;2,913.0,314.0;4,888.7,269.4;2,859.7,258.0;4,929.5,292.9;3,923.7,243.3;4,920.0,270.1;4,910.4,269.2;3,876.6,263.6;3,924.6,236.7;4,884.4,276.1;4,883.4,280.4;1,876.9,233.8;4,903.3,283.8;4,912.2,304.9;4,914.4,286.7;3,909.5,252.8;4,910.2,270.8;4,928.8,275.2;3,877.9,243.5;3,937.6,295.8;4,943.4,286.6;4,901.1,284.4;4,916.3,290.7;4,904.3,305.2;3,943.0,275.3;4,898.2,290.1;4,908.2,299.1;4,931.3,267.5;4,898.0,274.3;4,903.8,268.5;4,893.8,261.0;4,897.1,279.4;3,920.3,306.7;4,910.7,275.5;4,902.6,272.2;4,900.5,285.9;4,885.2,278.6;3,879.3,257.6;4,917.5,277.2;3,927.3,258.2;4,885.1,274.8;4,932.8,290.4;4,898.1,287.0;3,893.3,267.0;3,928.4,297.8;4,909.9,304.2;4,906.5,255.7;4,926.9,283.5;3,900.3,248.7;2,899.1,229.5;4,138.8,164.4;0,187.5,104.3;4,169.8,168.3;4,155.6,163.5;4,175.8,170.8;2,149.0,127.0;4,164.3,168.2;3,143.6,146.0;3,135.0,155.5;4,153.2,153.5;4,166.4,164.0;4,173.4,155.8;2,171.6,122.7;4,138.1,165.1;3,192.4,175.1;4,173.3,161.6;3,147.4,134.0;3,145.4,147.1;4,161.9,161.4;4,171.0,147.0;4,137.8,165.0;4,175.6,154.7;2,129.2,164.5;3,171.2,183.1;3,151.6,175.5;3,147.2,179.9;4,147.0,165.4;1,179.5,198.4;4,176.0,166.4;4,164.2,153.7;3,180.6,166.8;4,164.0,163.7;3,138.2,135.7;3,143.2,174.9;4,162.8,155.9;3,152.4,144.3;2,139.7,182.3;2,141.3,174.8;3,176.5,178.5;2,170.8,197.0;3,146.0,144.8;3,154.9,136.4;2,127.5,169.6;2,195.1,119.6;2,150.9,142.0;1,117.7,145.8;3,175.6,177.3;4,159.4,157.4;3,152.0,157.8;2,144.3,134.9;3,175.1,191.3;2,148.8,193.2;4,181.3,169.4;2,141.9,181.3;4,176.0,157.3;4,165.1,158.5;3,166.6,137.4;3,149.7,169.7;3,164.0,185.0;4,155.9,157.7;2,121.0,154.0;3,158.8,170.4;3,129.3,161.7;4,170.0,168.6;4,170.3,161.0;3,131.5,167.0;3,162.6,176.2;4,168.0,155.4;4,188.3,159.0;3,185.7,177.1;3,166.1,145.7;0,202.7,208.9;2,191.2,188.1;2,114.9,146.5;3,159.9,147.3;2,135.6,181.6;3,160.7,140.4;3,137.1,165.9;4,177.6,171.4;4,175.4,174.4;2,129.7,145.0;4,171.5,166.4;3,139.1,168.3;3,169.0,173.5;3,149.4,146.7;4,170.9,164.1;2,124.8,172.0;4,183.5,168.6;3,139.4,143.7;4,171.1,156.1;3,146.4,166.6;1,198.5,192.6;4,175.8,160.8;3,162.1,181.5;4,164.9,154.8;3,163.8,176.6;3,154.9,142.2;4,164.4,160.2;3,158.5,142.2;3,140.3,166.3;3,175.2,178.8;4,163.6,159.4;4,162.1,163.9;3,133.3,157.9;3,151.3,156.9;2,189.5,177.4;4,163.5,156.0;3,153.7,175.2;3,195.2,141.8;4,158.7,153.9;3,145.7,141.5;2,141.3,139.1;4,175.8,164.4;3,180.3,169.5;2,129.6,176.3;3,191.9,161.7;3,185.6,174.6;2,157.1,187.0;3,150.8,176.3;4,159.7,143.9;3,226.5,236.2;3,203.3,236.1;3,169.7,228.6;3,206.6,251.7;3,190.5,225.6;3,196.0,244.4;3,233.3,250.6;3,230.8,251.0;3,208.7,265.7;2,196.3,260.2;3,203.5,227.4;4,201.8,252.7;3,206.4,253.9;4,204.1,245.7;3,218.7,251.7;4,194.6,237.0;2,169.0,216.7;3,203.3,256.2;3,230.5,252.7;3,185.0,233.6;3,237.8,229.5;2,157.0,235.0;3,192.8,246.7;3,172.3,236.9;3,219.4,227.6;3,177.6,236.4;3,200.1,228.9;3,227.7,231.7;2,234.8,261.6;3,199.4,230.9;3,214.3,229.4;4,218.2,225.3;3,209.7,253.6;3,189.6,241.4;3,198.5,253.0;3,230.7,229.7;3,195.7,246.4;3,217.9,270.2;2,242.0,217.7;3,206.0,224.2;3,234.3,248.3;4,230.0,240.0;2,242.9,214.2;3,211.3,221.4;3,205.4,254.1;3,210.5,251.5;3,195.5,239.3;2,176.4,208.5;3,198.7,235.9;3,210.5,227.9;3,219.8,262.3;3,174.1,244.7;4,211.7,235.8;3,194.4,226.0;3,236.8,256.2;2,224.6,215.8;2,159.4,219.7;3,208.0,251.0;3,214.0,258.9;1,156.6,224.9;3,231.1,232.7;2,230.3,208.4;3,222.1,221.2;4,211.5,242.1;3,202.8,240.9;2,200.2,190.7;3,199.9,230.5;3,233.2,251.4;3,231.0,226.6;3,210.3,253.8;3,178.8,223.2;3,208.4,261.8;4,209.1,222.1;4,204.3,241.9;3,226.4,225.2;2,178.1,209.3;3,213.3,246.5;4,218.3,250.8;4,209.5,257.2;2,200.5,269.7;3,206.0,220.1;3,213.4,259.6;3,200.5,232.5;3,178.8,225.3;3,209.3,257.9;1,368.5,203.3;2,409.8,220.0;1,419.9,203.0;1,447.8,184.8;2,426.3,219.4;1,416.3,230.8;2,429.1,200.0;1,396.3,178.4;3,382.0,197.8;2,384.3,169.7;2,440.1,205.7;2,386.4,189.9;2,401.9,225.2;2,436.0,210.7;3,386.0,203.7;2,367.9,223.5;2,362.5,207.6;2,390.4,165.9;2,420.1,208.1;1,443.5,224.6;2,433.1,222.6;3,372.8,205.1;3,386.0,208.8;2,419.6,190.8;2,356.8,226.4;1,343.9,202.2;2,373.1,220.7;2,364.3,231.3;3,391.5,210.1;1,356.2,155.5;2,389.7,200.2;2,381.8,186.2;1,421.3,143.4;1,346.4,164.1;2,401.8,184.3;3,383.0,204.6;2,372.7,185.0;2,396.4,230.0;1,426.7,179.1;2,409.3,200.0;1,351.1,171.7;2,416.4,217.2;2,388.0,196.0;1,438.6,234.2;2,381.5,182.4;2,372.7,185.4;2,370.3,188.1;2,382.9,223.1;1,431.1,217.6;2,396.7,200.8;2,433.3,202.2;2,406.3,206.6;2,423.4,195.9;2,379.5,219.4;1,398.2,164.6;1,367.8,192.4;2,417.2,200.5;1,421.8,221.2;1,353.0,175.1;1,417.2,232.2;1,359.6,189.4;1,398.0,184.6;1,426.6,188.7;2,403.2,214.8;2,423.3,194.3;2,412.6,179.8;1,447.4,193.4;2,423.7,228.5;1,367.8,202.9;2,370.0,212.5;2,361.9,219.0;2,417.5,206.7;2,369.5,209.5;1,363.1,156.6;3,386.4,210.7;1,415.0,221.8;2,385.9,208.0;2,414.9,197.7;2,427.1,202.6;1,421.9,221.7;2,392.7,194.1;2,380.3,206.3;0,412.0,156.2;3,406.8,212.9;2,434.9,213.4;2,440.2,200.6;2,408.4,209.9;1,421.0,192.6;2,400.4,207.2;2,430.6,236.5;2,378.6,222.0;2,344.0,210.1;1,348.7,197.0;3,391.3,210.3;2,339.4,213.9;2,340.6,187.8;1,330.8,201.3;2,341.1,169.7;2,344.0,176.2;2,324.2,156.1;2,343.2,203.2;2,343.9,169.3;2,339.9,188.7;2,351.3,183.4;2,334.2,180.5;1,308.9,184.8;1,347.8,163.9;1,307.2,168.5;2,337.9,184.3;2,343.3,173.8;1,366.1,179.2;2,314.9,186.7;1,324.4,191.8;2,341.4,182.2;1,366.6,179.0;1,343.8,163.3;1,364.9,185.2;2,356.2,188.0;2,323.5,200.5;2,332.3,189.1;1,336.1,200.9;1,321.6,153.2;2,332.2,183.2;2,331.7,181.4;1,330.1,194.5;2,330.6,174.4;2,337.3,199.5;1,320.2,155.3;2,337.5,199.9;1,326.6,194.4;1,353.5,188.6;1,330.0,169.0;2,345.3,187.7;2,334.2,169.9;1,334.0,144.1;2,352.7,183.6;1,323.3,207.0;2,313.2,176.0;1,345.9,175.0;1,341.2,165.4;1,315.1,310.4;1,342.5,308.9;1,364.5,316.6;1,303.2,319.9;1,318.4,316.1;2,346.5,317.6;1,292.9,314.9;1,337.8,301.3;1,303.7,315.6;2,323.7,314.6;1,316.7,311.5;1,272.3,317.8;1,358.4,325.0;2,375.7,318.2;1,299.6,308.7;1,359.4,319.5;1,388.0,310.7;1,303.7,312.6;1,294.2,310.0;2,355.9,316.4;1,356.4,320.6;1,249.5,312.2;2,324.7,316.6;1,381.9,309.8;1,361.0,309.9;0,279.2,322.4;1,315.8,317.8;2,345.6,313.2;1,278.4,313.4;2,285.5,309.9;1,348.2,311.7;1,345.4,317.7;1,332.9,304.8;2,343.7,310.1;1,541.1,220.1;1,522.0,199.2;0,565.6,195.6;0,561.5,244.0;1,558.2,254.1;1,563.0,243.2;1,551.3,231.3;0,513.5,189.2;1,543.1,234.7;2,553.6,226.3;2,550.1,217.4;1,546.7,197.8;1,526.1,233.2;1,536.8,213.9;1,556.2,230.4;1,558.0,225.7;1,561.1,243.3;1,526.5,218.1;1,517.3,184.0;0,499.9,229.8;0,722.9,231.6;1,800.0,236.7;1,798.3,237.6;1,800.4,212.3;1,790.3,232.2;1,789.7,240.6;1,764.6,225.4;1,769.4,228.7;0,832.1,248.9;1,771.3,222.6;0,834.4,232.3;1,800.9,214.7;1,735.5,237.8;1,832.6,253.7".split(";").map(s=>s.split(",").map(Number));
const RAMP = ["var(--heat-1)","var(--heat-2)","var(--heat-3)","var(--heat-4)","var(--heat-5)"];
const PLUME = [[139.6,-5.4,1.0],[102.6,0.2,0.7],[104.4,-3.4,0.55]];
const VOLCANO = [[98.4,3.2],[100.5,-0.4],[105.4,-6.1],[110.4,-7.5],[112.9,-8.1],[116.5,-8.3],[119.1,-8.2]];
const proj = (lo,la)=>[(lo-94)*20,(8.4-la)*20];

function buildHeat(state){
  const calm = state==="calm";
  let svg="", plume="";
  if(!calm){
    PLUME.forEach(([lo,la,k])=>{
      const [x,y]=proj(lo,la), w=175*k, h=30*k;
      plume += `<path d="M${(x-w*.2).toFixed(0)} ${y.toFixed(0)} `
             + `q${(w*.30).toFixed(0)} ${(-h*.75).toFixed(0)} ${(w*.62).toFixed(0)} ${(-h*.15).toFixed(0)} `
             + `q${(w*.30).toFixed(0)} ${(h*.55).toFixed(0)} ${(-w*.20).toFixed(0)} ${(h*.62).toFixed(0)} z" `
             + `fill="rgba(255,178,110,.10)"/>`;
    });
    svg += `<g filter="url(#soften)">${plume}</g>`;
  }
  HEAT.forEach(([t,x,y],i)=>{
    if(calm && i%5!==0) return;
    const tier = calm?0:t, r = 1.7+tier*0.26;
    svg += `<circle cx="${x}" cy="${y}" r="${(r*2.7).toFixed(1)}" fill="${RAMP[tier]}" opacity="${calm?.10:.16}"/>`;
    svg += `<circle cx="${x}" cy="${y}" r="${r.toFixed(1)}" fill="${RAMP[tier]}" opacity="${calm?.8:.95}"/>`;
  });
  VOLCANO.forEach(([lo,la])=>{
    const [x,y]=proj(lo,la);
    svg += `<g><circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="6" fill="var(--surface-1)" stroke="var(--alert)" stroke-width="1"/>`
        +  `<path d="M${x.toFixed(0)} ${(y-3).toFixed(0)} l3 5 h-6 z" fill="var(--alert)"/></g>`;
  });
  document.getElementById("heat").innerHTML = svg;
}
function renderKPI(state){
  document.querySelector(".kpi-rail").innerHTML = KPI[state].map(k=>`
    <article class="kpi">
      <div class="kpi-top"><span class="micro">${k.m}</span><span class="dot d-${k.d}"></span></div>
      <div class="kpi-num ${k.t==="danger"?"t-danger":k.t==="nominal"?"t-nominal":""}">${k.n}</div>
      ${k.s?`<div class="kpi-sub ${k.t==="danger"?"t-danger":k.t==="nominal"?"t-nominal":""}">${k.s}</div>`:""}
    </article>`).join("");
}
function renderAlerts(state){
  const ul=document.getElementById("alerts"), title=document.getElementById("attnTitle");
  if(state==="calm"){
    title.textContent="Perlu perhatian · 0 peristiwa";
    ul.innerHTML=`<li class="calm"><span class="dot d-nominal"></span>
      <b>Tidak ada peristiwa aktif<span>Pemantauan berjalan normal</span></b></li>`;
    return;
  }
  title.textContent="Perlu perhatian · "+ALERTS[state].length+" peristiwa";
  ul.innerHTML = ALERTS[state].map(a=>`
    <li tabindex="0" class="${a.live?"is-live":""}" aria-label="${a.t}, ${a.s}, ${a.a}">
      <span class="dot d-${a.d}" style="margin-top:5px"></span>
      <span><span class="a-name">${a.t}</span><span class="a-sub">${a.s}</span></span>
      <span class="a-ago">${a.a}</span></li>`).join("");
}
function renderEvents(state){
  document.getElementById("events").innerHTML = EVENTS[state].map(([t,a,b])=>
    `<article class="ev"><time>${t}</time><b><span>${a}</span> ${b}</b></article>`).join("");
}
const MAP_BOX={x0:40,x1:940,y0:8,y1:458};
function fitMap(){
  const c=document.querySelector(".map-card"), s=document.querySelector(".map-svg");
  if(!c||!s) return;
  const cw=c.clientWidth, ch=c.clientHeight; if(!cw||!ch) return;
  const scale=Math.min(cw/(MAP_BOX.x1-MAP_BOX.x0), ch/(MAP_BOX.y1-MAP_BOX.y0));
  const vw=cw/scale, vh=ch/scale;
  const cx=(MAP_BOX.x0+MAP_BOX.x1)/2;
  const cy=(MAP_BOX.y0+MAP_BOX.y1)/2 - (ch>cw ? vh*0.13 : 0);
  s.setAttribute("viewBox",`${(cx-vw/2).toFixed(1)} ${(cy-vh/2).toFixed(1)} ${vw.toFixed(1)} ${vh.toFixed(1)}`);
}

function initProtoMap(){
  if(typeof buildHeat === 'function') buildHeat('alert');
  if(typeof fitMap === 'function'){ fitMap(); window.addEventListener('resize', fitMap); }
}
document.addEventListener('DOMContentLoaded', initProtoMap);
})();