(() => {
  'use strict';

  const STYLE_ID = 'digirupee-reward-hero-balance-fix';

  function installStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      /* Rewards hero only: keep the model clean and move the treasure visual left. */
      #rewards .reward-v4-hero{position:relative!important;isolation:isolate!important;overflow:hidden!important}
      #rewards .reward-v4-copy{position:relative!important;z-index:5!important;max-width:59%!important}
      #rewards .reward-v4-mascot{
        z-index:3!important;
        top:-2%!important;
        right:-4%!important;
        width:49%!important;
        height:104%!important;
        overflow:hidden!important;
        opacity:1!important;
        -webkit-mask-image:linear-gradient(90deg,transparent 0%,rgba(0,0,0,.38) 10%,#000 27%,#000 100%)!important;
        mask-image:linear-gradient(90deg,transparent 0%,rgba(0,0,0,.38) 10%,#000 27%,#000 100%)!important;
      }
      #rewards .reward-v4-mascot img{
        inset:0!important;
        width:100%!important;
        height:100%!important;
        max-width:none!important;
        object-fit:cover!important;
        object-position:100% 12%!important;
        transform:scale(1.09)!important;
        transform-origin:100% 8%!important;
        filter:saturate(1.03) contrast(1.03)!important;
      }
      /* Fade the lower treasure area out of the model layer. This leaves the face,
         hair and upper portrait unobstructed while the cloned treasure sits left. */
      #rewards .reward-v4-mascot:after{
        content:''!important;
        position:absolute!important;
        z-index:4!important;
        left:0!important;
        right:0!important;
        bottom:0!important;
        height:37%!important;
        pointer-events:none!important;
        background:linear-gradient(180deg,rgba(69,14,14,0) 0%,rgba(63,13,13,.68) 52%,rgba(55,11,12,.98) 100%)!important;
      }
      #rewards .digi-reward-treasure{
        position:absolute!important;
        z-index:2!important;
        left:19%!important;
        bottom:-2%!important;
        width:38%!important;
        height:48%!important;
        overflow:hidden!important;
        pointer-events:none!important;
        opacity:.88!important;
        -webkit-mask-image:radial-gradient(ellipse at 52% 68%,#000 0%,#000 46%,rgba(0,0,0,.72) 61%,transparent 82%)!important;
        mask-image:radial-gradient(ellipse at 52% 68%,#000 0%,#000 46%,rgba(0,0,0,.72) 61%,transparent 82%)!important;
        filter:drop-shadow(0 9px 12px rgba(0,0,0,.22))!important;
      }
      #rewards .digi-reward-treasure img{
        position:absolute!important;
        left:-190%!important;
        bottom:-2%!important;
        width:285%!important;
        height:auto!important;
        max-width:none!important;
        opacity:1!important;
        filter:saturate(1.09) contrast(1.04) brightness(1.04)!important;
      }
      /* Keep text readable while allowing the moved treasure to sit behind it. */
      #rewards .reward-v4-copy:after{
        content:''!important;
        position:absolute!important;
        z-index:-1!important;
        inset:-10px -15px -12px -10px!important;
        pointer-events:none!important;
        background:radial-gradient(ellipse at 18% 50%,rgba(73,9,18,.34),transparent 72%)!important;
      }
      @media(max-width:380px){
        #rewards .reward-v4-copy{max-width:61%!important}
        #rewards .reward-v4-mascot{right:-5%!important;width:50%!important;height:104%!important}
        #rewards .digi-reward-treasure{left:18%!important;bottom:-1%!important;width:39%!important;height:47%!important;opacity:.84!important}
      }
    `;
    document.head.appendChild(style);
  }

  function arrangeHero() {
    installStyle();
    const hero = document.querySelector('#rewards .reward-v4-hero');
    const mascot = hero?.querySelector('.reward-v4-mascot');
    const source = mascot?.querySelector('img');
    if (!hero || !mascot || !source) return;

    let treasure = hero.querySelector('.digi-reward-treasure');
    if (!treasure) {
      treasure = document.createElement('div');
      treasure.className = 'digi-reward-treasure';
      treasure.setAttribute('aria-hidden', 'true');
      const image = source.cloneNode(false);
      image.removeAttribute('id');
      image.removeAttribute('alt');
      treasure.appendChild(image);
      hero.appendChild(treasure);
    } else {
      const image = treasure.querySelector('img');
      if (image && image.src !== source.src) image.src = source.src;
    }
  }

  let scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      arrangeHero();
    });
  }

  installStyle();
  schedule();
  document.addEventListener('DOMContentLoaded', schedule);
  window.addEventListener('digirupee:rewards-built', schedule);
  window.addEventListener('digirupee:state', schedule);
  new MutationObserver(schedule).observe(document.documentElement, { childList:true, subtree:true });
})();
