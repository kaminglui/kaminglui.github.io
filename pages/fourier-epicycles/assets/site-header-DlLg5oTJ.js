const m=[{id:"about",label:"About"},{id:"learning",label:"Learning"},{id:"posts",label:"Posts"},{id:"projects",label:"Projects"},{id:"experience",label:"Experience"},{id:"education",label:"Education"},{id:"contact",label:"Contact"}],u=[{id:"circuit-lab",label:"Circuit Lab",href:"pages/circuit-lab/"},{id:"transformer-lab",label:"Transformer Lab",href:"pages/transformer-lab/"},{id:"ml-playground",label:"ML Playground",href:"pages/ml-playground/"},{id:"fourier-epicycles",label:"Fourier Epicycles",href:"pages/fourier-epicycles/"},{id:"endless-depths",label:"Endless Depths",href:"pages/endless-depths/"}],y="Ka Ming Lui";function p(t){return t?t==="/"?"/":t.endsWith("/")?t:`${t}/`:""}function L(t=""){var r,o;const e=((r=document.documentElement)==null?void 0:r.dataset.navRoot)??((o=document.body)==null?void 0:o.dataset.navRoot)??null;if(typeof e=="string"&&e.trim())return p(e.trim());const a=(typeof t=="string"?t:"").split(/[?#]/)[0].replace(/\\/g,"/").split("/").filter(Boolean);return a.length&&a[a.length-1].includes(".")&&a.pop(),a.length===0?"":"../".repeat(a.length)}function w(t=""){var r,o;const e=((r=document.body)==null?void 0:r.dataset.currentLab)??((o=document.documentElement)==null?void 0:o.dataset.currentLab)??null;if(e)return e;const s=(typeof t=="string"?t:"").toLowerCase().replace(/\\/g,"/"),a=u.find(l=>s.includes(`/${l.id.toLowerCase()}/`));return(a==null?void 0:a.id)??null}function $({rootPrefix:t,useLocalAnchors:e}){return m.map(({id:n,label:s})=>`<li><a href="${e?`#${n}`:`${t}index.html#${n}`}">${s}</a></li>`).join("")}function P({rootPrefix:t,currentLabId:e}){return u.map(({id:n,label:s,href:a})=>`<li><a href="${a.startsWith("http")?a:`${t}${a}`}"${n===e?' aria-current="page"':""}>${s}</a></li>`).join("")}function E(t={}){var i,d,c;const e=t.target??document.querySelector("[data-site-header]")??document.querySelector(".site-header");if(!e)return null;const n=e.querySelector(".nav");if(!(e.hasAttribute("data-site-header")||t.forceRender===!0)&&n||e.dataset.navRendered==="true"&&n)return n;const a=typeof t.rootPrefix=="string"&&t.rootPrefix.trim()||typeof((i=e==null?void 0:e.dataset)==null?void 0:i.navRoot)=="string"&&e.dataset.navRoot.trim(),r=p(a??L((d=window.location)==null?void 0:d.pathname)),o=t.useLocalAnchors??(r===""||e.dataset.useLocalAnchors==="true"),l=t.currentLab??e.dataset.currentLab??w((c=window.location)==null?void 0:c.pathname),g=t.showEditToggle===!0||e.dataset.showEditToggle==="true",b=o?"#hero":`${r}index.html#hero`,f=$({rootPrefix:r,useLocalAnchors:o}),h=P({rootPrefix:r,currentLabId:l}),v=`
    <div class="container">
      <nav class="nav" aria-label="Primary">
        <a class="logo" href="${b}">${y}</a>
        <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="primary-navigation">
          <span class="nav-toggle__bar"></span>
          <span class="nav-toggle__bar"></span>
          <span class="nav-toggle__bar"></span>
          <span class="sr-only">Toggle navigation</span>
        </button>
        <ul class="nav-links" id="primary-navigation" data-visible="false">
          <li class="nav-item nav-item--dropdown">
            <button class="nav-dropdown-toggle nav-pill" type="button" aria-expanded="false" aria-controls="section-menu">
              Sections
              <svg class="nav-dropdown__icon" aria-hidden="true" focusable="false" viewBox="0 0 12 12">
                <path d="M2.47 4.47a.75.75 0 0 1 1.06 0L6 6.94l2.47-2.47a.75.75 0 0 1 1.06 1.06l-3 3a.75.75 0 0 1-1.06 0l-3-3a.75.75 0 0 1 0-1.06Z" />
              </svg>
            </button>
            <ul class="nav-dropdown-menu" id="section-menu" hidden>
              ${f}
            </ul>
          </li>
          <li class="nav-item nav-item--dropdown">
            <button class="nav-dropdown-toggle nav-pill" type="button" aria-expanded="false" aria-controls="labs-menu">
              Labs
              <svg class="nav-dropdown__icon" aria-hidden="true" focusable="false" viewBox="0 0 12 12">
                <path d="M2.47 4.47a.75.75 0 0 1 1.06 0L6 6.94l2.47-2.47a.75.75 0 0 1 1.06 1.06l-3 3a.75.75 0 0 1-1.06 0l-3-3a.75.75 0 0 1 0-1.06Z" />
              </svg>
            </button>
            <ul class="nav-dropdown-menu" id="labs-menu" hidden>
              ${h}
            </ul>
          </li>
        </ul>
        <div class="nav-actions">
          ${g?'<button class="edit-toggle" type="button" aria-pressed="false" hidden>Edit mode</button>':""}
          <button class="theme-toggle" type="button" aria-label="Toggle color theme">
            <span aria-hidden="true">🌙</span>
          </button>
        </div>
      </nav>
    </div>
  `;return e.innerHTML=v.trim(),e.id=e.id||"top",e.classList.add("site-header"),e.dataset.navRendered="true",e.querySelector(".nav")}export{L as c,E as r};
