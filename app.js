/* ==========================================================================
   1. App Constants & Firebase Setup
   ========================================================================== */
const firebaseConfig = {
  apiKey: "AIzaSyA_Yz5ZgTWSGAIk-64riVkAlcLxLVsVtqU",
  authDomain: "elaraby-products.firebaseapp.com",
  databaseURL: "https://elaraby-products-default-rtdb.firebaseio.com",
  projectId: "elaraby-products",
  storageBucket: "elaraby-products.firebasestorage.app",
  messagingSenderId: "257061984766",
  appId: "1:257061984766:web:a098d2e590e59cf8c248af",
  measurementId: "G-M8CDWF61PE"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
let storage = null;
try {
  if (typeof firebase.storage === "function") storage = firebase.storage();
} catch (error) {
  console.warn("Firebase Storage is unavailable; product thumbnails will use the fallback.", error);
}

const REQUESTS_COLLECTION = "requests";
const PRODUCTS_COLLECTION = "products";
const BRANCHES_COLLECTION = "branches";

let WAREHOUSES = { 
  "RE-9014": "RE-9014 (طناش)", 
  "RE-9026": "RE-9026 (العاشر)", 
  "RE-9005": "RE-9005 (الإسكندرية)", 
  "RE-9031": "RE-9031 (أسيوط)" 
};

function el(id){ return document.getElementById(id); }
document.getElementById("yearNow").textContent = new Date().getFullYear();
document.querySelectorAll(".field").forEach(field => {
  const label = field.querySelector("label");
  const control = field.querySelector("input, select");
  if (label && control && control.id) label.htmlFor = control.id;
});

/* ==========================================================================
   Security: Safe Encoding & Toast System
   ========================================================================== */
function escapeHtml(str){
  if(str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/`/g, "&#96;");
}

function sanitizeText(str, maxLen = 200){
  if(!str) return "";
  return String(str).replace(/[<>'"`;(){}]/g, "").trim().slice(0, maxLen);
}

function sanitizeExcelCell(val){
  if(val === null || val === undefined) return "";
  if(typeof val === "number") return val;
  const str = String(val);
  return /^[=+\-@\t\r]/.test(str.trim()) ? "'" + str : str;
}

function showToast(message, type="info"){
  let wrap = el("toastWrap");
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.className = "toast-wrap";
    wrap.id = "toastWrap";
    document.body.appendChild(wrap);
  }
  const icons = {success:"icon-check", error:"icon-warning", warn:"icon-warning", info:"icon-info"};
  const t = document.createElement("div");
  t.className = "toast " + (["success","error","warn","info"].includes(type) ? type : "info");
  
  const iconSpan = document.createElement("span");
  iconSpan.innerHTML = `<svg class="ui-icon" aria-hidden="true"><use href="#${icons[type] || icons.info}"></use></svg>`;
  
  const textSpan = document.createElement("span");
  textSpan.textContent = String(message);
  
  t.appendChild(iconSpan);
  t.appendChild(textSpan);
  wrap.appendChild(t);

  setTimeout(()=>{ 
    t.style.transition = "opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1), transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)";
    t.style.opacity = "0"; 
    t.style.transform = "translateY(-10px) scale(0.98)";
    setTimeout(()=>t.remove(), 300); 
  }, 3500);
}

function setFieldError(id, isInvalid){ if(el(id)) el(id).classList.toggle("invalid", !!isInvalid); }

window.addEventListener("online", ()=> { el("offlineBanner").classList.remove("show"); el("connStatusText").textContent="متصل"; el("connStatus").classList.remove("offline"); });
window.addEventListener("offline", ()=>{ el("offlineBanner").classList.add("show"); el("connStatusText").textContent="غير متصل"; el("connStatus").classList.add("offline"); });

/* ==========================================================================
   2. Branch Master Data & Centralized Normalization
   ========================================================================== */
let branchesMasterData = [];
const BRANCH_INPUT_IDS = ["branchName", "bgBranchCode", "dsBranchCode", "ssBranchName"];

db.collection(BRANCHES_COLLECTION).onSnapshot(snap => {
    branchesMasterData = snap.docs.map(doc => doc.data());
    branchesMasterData.forEach(b => { if(b.warehouseCode && !WAREHOUSES[b.warehouseCode]) WAREHOUSES[b.warehouseCode] = b.warehouseCode; });
    
    const whSelect = el("warehouse");
    if(whSelect) {
        const currentVal = whSelect.value;
        whSelect.innerHTML = `<option value="">اختر المخزن</option>` + Object.entries(WAREHOUSES).map(([k,v]) => `<option value="${escapeHtml(k)}">${escapeHtml(v)}</option>`).join("");
        if(currentVal) whSelect.value = currentVal;
    }

    BRANCH_INPUT_IDS.forEach(id => {
      const displayField = id + "DisplayField";
      const displayInput = id + "Display";
      if(el(id) && el(id).value) processBranchInput(id, displayField, displayInput, id === "branchName");
    });
}, err => console.error("Error loading branches", err));

function normalizeBranchCode(code) {
    if (!code) return "";
    let normalized = String(code).trim().toUpperCase().replace(/\s+/g, '');
    if (/^\d{4}$/.test(normalized)) return "RE-" + normalized;
    if (/^RE\d{4}$/.test(normalized)) return "RE-" + normalized.substring(2);
    return sanitizeText(normalized, 30);
}

function processBranchInput(inputId, displayWrapperId, displayInputId, isMainOrderTab = false) {
    const inputEl = el(inputId);
    const val = inputEl ? inputEl.value : "";
    if (!val) { clearBranchInfo(displayWrapperId, displayInputId, isMainOrderTab); return false; }
    
    const normalized = normalizeBranchCode(val);
    const branch = branchesMasterData.find(b => b.branchCode === normalized);
    
    let fieldId = inputId.replace('Code', 'Field').replace('Name', 'Field');
    if(inputId === 'ssBranchName') fieldId = 'ssBranchField';
    if(inputId === 'branchName') fieldId = 'branchField';
    
    if (branch) {
        inputEl.value = normalized;
        el(displayInputId).value = branch.branchName;
        el(displayWrapperId).style.display = "block";
        setFieldError(fieldId, false);
        
        if (isMainOrderTab) {
            const whSelect = el("warehouse");
            if(whSelect) { whSelect.value = branch.warehouseCode; setFieldError("warehouseField", false); }
        }
        return true;
    } else {
        clearBranchInfo(displayWrapperId, displayInputId, isMainOrderTab);
        setFieldError(fieldId, true);
        const errorEl = document.querySelector(`#${fieldId} .err-msg`);
        if(errorEl) errorEl.textContent = "كود الفرع غير موجود (Branch code not found)";
        return false;
    }
}

function clearBranchInfo(displayWrapperId, displayInputId, isMainOrderTab) {
    el(displayWrapperId).style.display = "none";
    el(displayInputId).value = "";
    if (isMainOrderTab) { const whSelect = el("warehouse"); if(whSelect) whSelect.value = ""; }
}

const LS_BRANCH = "tb_branch";
if(localStorage.getItem(LS_BRANCH)) {
    const stored = sanitizeText(localStorage.getItem(LS_BRANCH), 30);
    BRANCH_INPUT_IDS.forEach(id => { if(el(id)) el(id).value = stored; });
}

function syncBranchAcrossTabs(val) {
    const norm = normalizeBranchCode(val);
    localStorage.setItem(LS_BRANCH, norm);
    BRANCH_INPUT_IDS.forEach(id => {
        if(el(id) && el(id).value !== norm) {
            el(id).value = norm;
            processBranchInput(id, id + "DisplayField", id + "Display", id === "branchName");
        }
    });
}

BRANCH_INPUT_IDS.forEach(id => {
    const inputEl = el(id);
    if(!inputEl) return;
    inputEl.addEventListener("blur", () => {
        const displayField = id + "DisplayField";
        const displayInput = id + "Display";
        const isValid = processBranchInput(id, displayField, displayInput, id === "branchName");
        if (isValid && inputEl.value) syncBranchAcrossTabs(inputEl.value);
    });
    inputEl.addEventListener("keyup", (e) => { if(e.key === "Enter") inputEl.blur(); });
});


/* ==========================================================================
   3. Robust Versioned Persistence Engine
   ========================================================================== */
const CURRENT_SCHEMA_VERSION = 2;
const DB_NAME = "ElarabyOrderAppDB";
const STORE_ORDERS = "orders";
const STORE_META = "metadata";
const LS_SENT_KEY = "tb_sent_requests";
const LS_BACKUP_ORDERS_KEY = "tb_sent_orders_v2_backup";

let persistenceRequestStarted = false;
function requestPersistentBrowserStorage() {
  if (persistenceRequestStarted) return;
  persistenceRequestStarted = true;
  const storage = navigator.storage;
  if (!storage || !storage.persist || !storage.persisted) return;
  storage.persisted().then(isPersistent => {
    if (!isPersistent) return storage.persist();
  }).catch(() => {});
}
window.addEventListener("pointerdown", requestPersistentBrowserStorage, { once: true });
window.addEventListener("keydown", requestPersistentBrowserStorage, { once: true });

class PersistentStorageEngine {
  constructor() { this.db = null; this.isReady = false; this.initPromise = this.initDB(); }
  async initDB() {
    return new Promise((resolve) => {
      if (!window.indexedDB) { this.isReady = true; resolve(false); return; }
      try {
        const req = indexedDB.open(DB_NAME, CURRENT_SCHEMA_VERSION);
        req.onupgradeneeded = (evt) => {
          const db = evt.target.result;
          if (!db.objectStoreNames.contains(STORE_ORDERS)) {
            const orderStore = db.createObjectStore(STORE_ORDERS, { keyPath: "id" });
            orderStore.createIndex("status", "status", { unique: false });
            orderStore.createIndex("createdAtMillis", "createdAtMillis", { unique: false });
            orderStore.createIndex("schemaVersion", "schemaVersion", { unique: false });
          }
          if (!db.objectStoreNames.contains(STORE_META)) db.createObjectStore(STORE_META, { keyPath: "key" });
        };
        req.onsuccess = (evt) => { this.db = evt.target.result; this.isReady = true; this.migrateLegacyData().then(() => resolve(true)); };
        req.onerror = () => { this.isReady = true; resolve(false); };
      } catch (e) { this.isReady = true; resolve(false); }
    });
  }
  saveToLocalStorageBackup(orders) { try { localStorage.setItem(LS_BACKUP_ORDERS_KEY, JSON.stringify(orders.map(o => this.sanitizeOrder(o)).filter(Boolean))); } catch (e) {} }
  getFromLocalStorageBackup() {
    try {
      const raw = localStorage.getItem(LS_BACKUP_ORDERS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(o => this.sanitizeOrder(o)).filter(Boolean);
    } catch (e) {} return [];
  }
  sanitizeOrder(raw) {
    if (!raw || typeof raw !== "object") return null;
    const id = String(raw.id || raw.docId || ("loc_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5)));
    
    const products = Array.isArray(raw.products) ? raw.products.map(p => ({
          productName: sanitizeText(p.productName || p.name || "", 200),
          productCode: sanitizeText(p.productCode || p.id || p.code || "", 60),
          bundlePtkCode: sanitizeText(p.bundlePtkCode || p.bundle_code || "", 60),
          quantity: Math.max(1, Math.min(10000, Number(p.quantity) || 1)),
          warehouseId: sanitizeText(p.warehouseId || "", 30),
          warehouseName: sanitizeText(p.warehouseName || p.warehouseId || "", 40),
          status: sanitizeText(p.status || "", 40),
          totalSales: (typeof p.totalSales === 'number' && !isNaN(p.totalSales)) ? Math.max(0, p.totalSales) : "",
          tempId: p.tempId || Date.now() + Math.random()
        })) : [];

    const totalQuantity = Number(raw.totalQuantity) || (products.length ? products.reduce((sum, p) => sum + (p.quantity || 0), 0) : Number(raw.quantity) || 0);

    let createdAtMillis = Number(raw.createdAtMillis);
    if (!createdAtMillis) {
      if (raw.createdAt && typeof raw.createdAt.toMillis === "function") createdAtMillis = raw.createdAt.toMillis();
      else if (raw.createdAt && raw.createdAt.seconds) createdAtMillis = raw.createdAt.seconds * 1000;
      else createdAtMillis = Date.now();
    }

    let type = "order";
    if (raw.type === "dead_stock") type = "dead_stock";
    if (raw.type === "stagnant_sales") type = "stagnant_sales";
    if (raw.type === "branch_goods") type = "branch_goods";

    return {
      id, type,
      branchName: sanitizeText(raw.branchName || raw.branchCode || "", 40),
      realBranchName: sanitizeText(raw.realBranchName || "", 100),
      branchCode: sanitizeText(raw.branchCode || "", 30),
      status: sanitizeText(raw.status || "جديد", 30),
      products, productName: sanitizeText(raw.productName || "", 200), productCode: sanitizeText(raw.productCode || "", 60),
      bundlePtkCode: sanitizeText(raw.bundlePtkCode || "", 60), quantity: Number(raw.quantity) || totalQuantity,
      productsCount: products.length || 1, totalQuantity, totalSales: (typeof raw.totalSales === 'number' && !isNaN(raw.totalSales)) ? Math.max(0, raw.totalSales) : 0,
      createdAtMillis, schemaVersion: CURRENT_SCHEMA_VERSION
    };
  }

  async saveOrder(orderData) {
    await this.initPromise; const sanitized = this.sanitizeOrder(orderData); if (!sanitized) return null;
    if (this.db) {
      try { await new Promise((resolve, reject) => { const tx = this.db.transaction([STORE_ORDERS], "readwrite"); const req = tx.objectStore(STORE_ORDERS).put(sanitized); req.onsuccess = () => resolve(true); req.onerror = (e) => reject(e.target.error); }); } catch (err) {}
    }
    const allOrders = await this.getAllOrders();
    const idx = allOrders.findIndex(o => o.id === sanitized.id);
    if (idx >= 0) allOrders[idx] = sanitized; else allOrders.push(sanitized);
    this.saveToLocalStorageBackup(allOrders); saveSentRequestId(sanitized.id, false); return sanitized;
  }

  async getOrder(id) {
    await this.initPromise;
    if (this.db) {
      try {
        const res = await new Promise((resolve) => { const req = this.db.transaction([STORE_ORDERS], "readonly").objectStore(STORE_ORDERS).get(id); req.onsuccess = () => resolve(req.result || null); });
        if (res) return this.sanitizeOrder(res);
      } catch (e) {}
    }
    const backup = this.getFromLocalStorageBackup(); const found = backup.find(o => o.id === id); return found ? this.sanitizeOrder(found) : null;
  }

  async getAllOrders() {
    await this.initPromise; let list = [];
    if (this.db) {
      try { list = await new Promise((resolve) => { const req = this.db.transaction([STORE_ORDERS], "readonly").objectStore(STORE_ORDERS).getAll(); req.onsuccess = () => resolve(req.result || []); }); } catch (e) {}
    }
    if (!list || list.length === 0) list = this.getFromLocalStorageBackup(); return list.map(o => this.sanitizeOrder(o)).filter(Boolean);
  }

  async deleteOrder(id) {
    await this.initPromise;
    if (this.db) { try { await new Promise((resolve) => { const req = this.db.transaction([STORE_ORDERS], "readwrite").objectStore(STORE_ORDERS).delete(id); req.onsuccess = () => resolve(true); }); } catch (e) {} }
    const backup = this.getFromLocalStorageBackup().filter(o => o.id !== id); this.saveToLocalStorageBackup(backup); removeSentRequestId(id, false);
  }
  async migrateLegacyData() {
    try {
      const backupOrders = this.getFromLocalStorageBackup();
      if (backupOrders.length > 0 && this.db) {
        const tx = this.db.transaction([STORE_ORDERS], "readwrite");
        for (const order of backupOrders) { const sanitized = this.sanitizeOrder(order); if (sanitized) tx.objectStore(STORE_ORDERS).put(sanitized); }
      }
    } catch (e) {}
  }
}

const appStorage = new PersistentStorageEngine();

function getSentRequestIds(){ try{ return JSON.parse(localStorage.getItem(LS_SENT_KEY)) || []; } catch(e){ return []; } }
function saveSentRequestId(id, triggerListen = true){
  const list = getSentRequestIds();
  if(!list.includes(id)){ list.push(id); localStorage.setItem(LS_SENT_KEY, JSON.stringify(list)); }
  if (triggerListen) listenToSentRequests();
}
function removeSentRequestId(id, triggerListen = true){
  const list = getSentRequestIds().filter(x => x !== id);
  localStorage.setItem(LS_SENT_KEY, JSON.stringify(list));
  if (triggerListen) listenToSentRequests();
}
async function saveSentRequestToLS(orderObj){ if(!orderObj) return; await appStorage.saveOrder(orderObj); listenToSentRequests(); }

/* ==========================================================================
   4. Products & Autocomplete Logic
   ========================================================================== */
let allProducts = [];
const productImageUrlCache = new Map();
const AC_IMAGE_FALLBACK = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="%2387948f" stroke-width="1.5"%3E%3Crect x="3" y="4" width="18" height="16" rx="2"/%3E%3Ccircle cx="8.5" cy="9" r="1.5"/%3E%3Cpath d="m21 15-5-5L5 20"/%3E%3C/svg%3E';

function getProductImageReference(images) {
  if (typeof images === "string") return images.trim();
  if (Array.isArray(images)) {
    for (const image of images) {
      const reference = getProductImageReference(image);
      if (reference) return reference;
    }
    return "";
  }
  if (images && typeof images === "object") {
    for (const value of Object.values(images)) {
      const reference = getProductImageReference(value);
      if (reference) return reference;
    }
  }
  return "";
}

function resolveProductImageUrl(reference) {
  if (!reference) return Promise.resolve("");
  if (!storage && !/^https?:\/\//i.test(reference)) return Promise.resolve("");
  if (productImageUrlCache.has(reference)) return productImageUrlCache.get(reference);
  if (/^https?:\/\//i.test(reference)) {
    const directUrl = Promise.resolve(reference);
    productImageUrlCache.set(reference, directUrl);
    return directUrl;
  }

  const urlPromise = (async () => {
    try {
      const storageRef = /^gs:\/\//i.test(reference)
        ? storage.refFromURL(reference)
        : storage.ref(reference.replace(/^\/+/, ""));
      return await storageRef.getDownloadURL();
    } catch (error) {
      return "";
    }
  })();
  productImageUrlCache.set(reference, urlPromise);
  return urlPromise;
}

db.collection(PRODUCTS_COLLECTION).onSnapshot(snap=>{
  allProducts = [];
  snap.forEach(doc=>{
    const d = doc.data();
    if(d.active !== false){
      allProducts.push({
        id: doc.id,
        productName: sanitizeText(d.name || d.productName || doc.id, 200),
        productCode: sanitizeText(d.id || d.productCode || doc.id, 60),
        bundlePtkCode: sanitizeText(d.bundlePtkCode || d.bundle_code || "", 60),
        imageReference: getProductImageReference(d.images)
      });
    }
  });
});

function setupAc(inputId, listId, field, onSelect){
  const input = el(inputId), list = el(listId);
  if(!input || !list) return;
  input.addEventListener("input", ()=>{
    const q = input.value.trim().toLowerCase();
    if(!q){ list.classList.remove("open"); return; }
    const matches = allProducts.filter(p=>(p[field]||"").toLowerCase().includes(q)).slice(0,25);
    list.innerHTML = matches.length ? matches.map((p, index)=>`<div class="ac-item" data-product-index="${index}">
      <span class="ac-item-media">
        <img class="ac-item-image" src="${AC_IMAGE_FALLBACK}" alt="" aria-hidden="true" loading="lazy" decoding="async">
        <span class="ac-image-fallback" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="16" rx="2"></rect><circle cx="8.5" cy="9" r="1.5"></circle><path d="m21 15-5-5L5 20"></path></svg></span>
      </span>
      <span class="ac-item-info"><span class="ac-item-name">${escapeHtml(p.productName)}</span><span class="ac-code ac-item-code">${escapeHtml(p.productCode)}</span></span>
    </div>`).join("") : `<div class="ac-empty">لا توجد نتائج مطابقة</div>`;
    list.querySelectorAll(".ac-item").forEach((node, i)=>{
      const image = node.querySelector(".ac-item-image");
      const fallback = node.querySelector(".ac-image-fallback");
      image.addEventListener("error", () => { image.hidden = true; fallback.hidden = false; }, { once:true });
      fallback.hidden = true;
      if (matches[i].imageReference) {
        resolveProductImageUrl(matches[i].imageReference).then(url => {
          if (url && image.isConnected) image.src = url;
        });
      }
      node.addEventListener("click", ()=>{ onSelect(matches[i]); list.classList.remove("open"); });
    });
    list.classList.add("open");
  });
  document.addEventListener("click", e=>{ if(!input.contains(e.target) && !list.contains(e.target)) list.classList.remove("open"); });
}

// Order Tab Autocomplete
setupAc("prodName","prodNameList","productName", p=>{ 
  el("prodName").value=p.productName; el("prodCode").value=p.productCode; 
  if(p.bundlePtkCode) el("bundleCode").value=p.bundlePtkCode; 
  setFieldError("prodNameField",false); setFieldError("prodCodeField",false); 
});
setupAc("prodCode","prodCodeList","productCode", p=>{ 
  el("prodCode").value=p.productCode; el("prodName").value=p.productName; 
  if(p.bundlePtkCode) el("bundleCode").value=p.bundlePtkCode; 
  setFieldError("prodNameField",false); setFieldError("prodCodeField",false); 
});

// Branch Goods Tab Autocomplete
setupAc("bgProdName","bgProdNameList","productName", p=>{ 
  el("bgProdName").value=p.productName; el("bgProdCode").value=p.productCode; 
  setFieldError("bgProdNameField",false); setFieldError("bgProdCodeField",false); 
});
setupAc("bgProdCode","bgProdCodeList","productCode", p=>{ 
  el("bgProdCode").value=p.productCode; el("bgProdName").value=p.productName; 
  setFieldError("bgProdNameField",false); setFieldError("bgProdCodeField",false); 
});


/* ==========================================================================
   5. Regular Request Logic (Order)
   ========================================================================== */
let requestItems = [];
let currentEditOrderId = null;

el("addProductBtn").addEventListener("click", ()=>{
  const branchCode = el("branchName").value.trim();
  const normalized = normalizeBranchCode(branchCode);
  const isValidBranch = branchesMasterData.some(b => b.branchCode === normalized);
  let v = true;
  if (!isValidBranch) {
      setFieldError("branchField", true);
      const errorEl = document.querySelector(`#branchField .err-msg`);
      if(errorEl) errorEl.textContent = "كود الفرع غير موجود (Branch code not found)";
      v = false;
  }

  const name = sanitizeText(el("prodName").value.trim(), 200);
  const code = sanitizeText(el("prodCode").value.trim(), 60);
  const bundle = sanitizeText(el("bundleCode").value.trim(), 60);
  const qtyVal = parseInt(el("qty").value, 10);
  const wh = el("warehouse").value;

  if(!name){ setFieldError("prodNameField",true); v=false; }
  if(!code){ setFieldError("prodCodeField",true); v=false; }
  if(isNaN(qtyVal) || qtyVal < 1 || qtyVal > 100){ setFieldError("qtyField",true); v=false; }
  if(!wh || !WAREHOUSES[wh]){ setFieldError("warehouseField",true); v=false; }
  if(!v) return;

  requestItems.push({
    tempId: Date.now() + Math.random(),
    productName: name, productCode: code, bundlePtkCode: bundle, quantity: qtyVal,
    warehouseId: wh, warehouseName: WAREHOUSES[wh]
  });
  
  el("prodName").value=""; el("prodCode").value=""; el("bundleCode").value=""; el("qty").value=""; 
  renderProductsList();
});

function renderProductsList(){
  const wrap = el("productsList");
  if(!requestItems.length){
    el("emptyState").style.display="block"; el("summaryBar").style.display="none"; el("submitRequestBtn").disabled=true; wrap.innerHTML=""; return;
  }
  el("emptyState").style.display="none"; el("summaryBar").style.display="flex"; el("submitRequestBtn").disabled=false;
  
  let totalQty = 0;
  wrap.innerHTML = requestItems.map(item=>{
    totalQty += item.quantity;
    return `<div class="product-row">
      <div class="pr-main">
        <div class="pr-name">${escapeHtml(item.productName)}</div>
        <div class="pr-meta"><span>الكود: ${escapeHtml(item.productCode)}</span> <span class="pr-qty">الكمية: ${item.quantity}</span> <span>${escapeHtml(item.warehouseName)}</span></div>
      </div>
      <div class="pr-actions"><button type="button" class="btn btn-danger btn-icon" data-remove-product="${item.tempId}" title="إزالة من القائمة" aria-label="إزالة ${escapeHtml(item.productName)} من القائمة"><svg class="ui-icon" aria-hidden="true"><use href="#icon-trash"></use></svg></button></div>
    </div>`;
  }).join("");
  el("sumCount").textContent = requestItems.length;
  el("sumQty").textContent = totalQty;
}

function removeProduct(id){ requestItems = requestItems.filter(i=>i.tempId!==id); renderProductsList(); }
el("productsList").addEventListener("click", event => {
  const button = event.target.closest("[data-remove-product]");
  if (!button) return;
  const id = Number(button.dataset.removeProduct);
  if (Number.isFinite(id)) removeProduct(id);
});

el("submitRequestBtn").addEventListener("click", ()=>{
  const branch = el("branchName").value.trim();
  const normalized = normalizeBranchCode(branch);
  const branchObj = branchesMasterData.find(b => b.branchCode === normalized);
  if(!branch || !branchObj){ 
      setFieldError("branchField",true); showToast("كود الفرع غير صحيح","error"); window.scrollTo(0,0); return; 
  }
  setFieldError("branchField",false);
  el("cfBranch").textContent = `${normalized} - ${branchObj.branchName}`; 
  el("cfCount").textContent = requestItems.length; 
  el("cfQty").textContent = requestItems.reduce((s,i)=>s+i.quantity,0);
  el("cfProducts").innerHTML = requestItems.map(i=>`<div class="cp-item"><span>${escapeHtml(i.productName)} (<code>${escapeHtml(i.productCode)}</code>)</span><span style="font-weight:bold; color:var(--c-primary);">${i.quantity}</span></div>`).join("");
  
  el("confirmModalTitle").textContent = currentEditOrderId ? "تأكيد تحديث الطلب" : "تأكيد إرسال الطلب";
  el("confirmSendBtn").textContent = currentEditOrderId ? "تأكيد التحديث" : "تأكيد الإرسال";
  
  el("confirmModal").classList.add("open");
});

document.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click", ()=>el("confirmModal").classList.remove("open")));

let lastConfirmedOrderSummary = null;
let selectedSavedOrderId = null;
let showAllSavedOrders = false;
function setSelectedSavedOrder(id) {
  selectedSavedOrderId = id;
  el("savedOrdersList").querySelectorAll("[data-edit-saved-order]").forEach(button => {
    button.setAttribute("aria-pressed", String(button.dataset.editSavedOrder === id));
  });
}

el("confirmSendBtn").addEventListener("click", async ()=>{
  if(!navigator.onLine) return showToast("لا يوجد اتصال بالإنترنت", "error");
  const btn = el("confirmSendBtn"); btn.disabled = true; btn.innerHTML = `<span class="loader"></span> جارٍ المعالجة...`;

  try{
    const branchVal = el("branchName").value.trim();
    const normalizedBranch = normalizeBranchCode(branchVal);
    const branchObj = branchesMasterData.find(b => b.branchCode === normalizedBranch);
    const realBranchName = branchObj ? branchObj.branchName : "";

    const docData = {
      type: "order", branchName: normalizedBranch, realBranchName: realBranchName, branchCode: normalizedBranch, status: "جديد", 
      products: requestItems.map(p => ({
        productName: sanitizeText(p.productName, 200), productCode: sanitizeText(p.productCode, 60), bundlePtkCode: sanitizeText(p.bundlePtkCode, 60),
        quantity: Math.max(1, Number(p.quantity) || 1), warehouseId: p.warehouseId, warehouseName: p.warehouseName
      })),
      productsCount: requestItems.length, totalQuantity: requestItems.reduce((s,p)=>s+p.quantity,0), updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    let savedOrderId = currentEditOrderId;
    const isEditing = !!currentEditOrderId;

    if (isEditing) {
        await db.collection(REQUESTS_COLLECTION).doc(currentEditOrderId).update(docData);
        const existingLocal = await appStorage.getOrder(currentEditOrderId);
        await saveSentRequestToLS({ ...existingLocal, ...docData, id: currentEditOrderId, type: "order" });
        showToast("تم تحديث الطلب بنجاح", "success");
    } else {
        docData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        const docRef = await db.collection(REQUESTS_COLLECTION).add(docData);
        savedOrderId = docRef.id;
        await saveSentRequestToLS({ ...docData, id: docRef.id, type: "order", createdAtMillis: Date.now() });
        showToast("تم إرسال الطلب بنجاح", "success");
    }

    const now = new Date();
    lastConfirmedOrderSummary = {
      id: savedOrderId, shortId: savedOrderId.slice(0, 8), status: docData.status, branchCode: normalizedBranch,
      branchName: realBranchName, branchDisplay: `${normalizedBranch} - ${realBranchName}`,
      dateStr: now.toLocaleDateString('ar-EG'), timeStr: now.toLocaleTimeString('ar-EG', {hour:'2-digit', minute:'2-digit'}),
      products: [...requestItems], totalCount: requestItems.length, totalQty: requestItems.reduce((s,p)=>s+p.quantity,0), isEdit: isEditing
    };

    requestItems = []; renderProductsList(); el("confirmModal").classList.remove("open");
    currentEditOrderId = null; el("submitRequestBtn").innerHTML = `<svg class="ui-icon" aria-hidden="true"><use href="#icon-send"></use></svg> إرسال طلب البضاعة`;
    setSelectedSavedOrder(null); el("cancelEditBtn").style.display = "none";

    displayOrderSuccessModal(lastConfirmedOrderSummary);
  }catch(err){ showToast("تعذر إرسال الطلب، يرجى المحاولة مرة أخرى", "error"); }
  finally{ btn.disabled = false; btn.innerHTML = currentEditOrderId ? "تأكيد التحديث" : "تأكيد الإرسال"; }
});

async function loadSavedOrder(id) {
  if (!id) return;
    const order = await appStorage.getOrder(id); if(!order) return showToast("تعذر تحميل الطلب", "error");

  setSelectedSavedOrder(id);
    currentEditOrderId = order.id; el("branchName").value = order.branchCode || order.branchName;
    processBranchInput("branchName", "branchNameDisplayField", "branchNameDisplay", true);
    
    requestItems = (order.products || []).map(p => ({ ...p, tempId: p.tempId || Date.now() + Math.random() }));
    renderProductsList();
    
    el("submitRequestBtn").innerHTML = `<svg class="ui-icon" aria-hidden="true"><use href="#icon-history"></use></svg> تحديث طلب البضاعة`; el("submitRequestBtn").disabled = false;
    el("cancelEditBtn").style.display = "inline-flex";
    showToast("تم تحميل الطلب للتعديل", "success"); window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  el("savedOrdersList").addEventListener("click", async event => {
    const deleteButton = event.target.closest("[data-delete-saved-order]");
    if (deleteButton) return openDeleteOrderDialog(deleteButton.dataset.deleteSavedOrder);
    const orderButton = event.target.closest("[data-edit-saved-order]");
    if (orderButton) await loadSavedOrder(orderButton.dataset.editSavedOrder);
  });

  el("showMoreSavedOrdersBtn").addEventListener("click", async () => {
    showAllSavedOrders = !showAllSavedOrders;
    renderSentHistory(await appStorage.getAllOrders());
  });

el("cancelEditBtn").addEventListener("click", () => {
    currentEditOrderId = null; setSelectedSavedOrder(null); requestItems = []; renderProductsList();
    el("cancelEditBtn").style.display = "none";
    el("submitRequestBtn").innerHTML = `<svg class="ui-icon" aria-hidden="true"><use href="#icon-send"></use></svg> إرسال طلب البضاعة`; showToast("تم إلغاء التعديل", "info");
});

/* ==========================================================================
   6. BRANCH GOODS Logic (New Feature with UX/UI Enhancements)
   ========================================================================== */
let bgRequestItems = [];
let currentEditBgOrderId = null;

el("bgAddProductBtn").addEventListener("click", ()=>{
  const branchCode = el("bgBranchCode").value.trim();
  const normalized = normalizeBranchCode(branchCode);
  const isValidBranch = branchesMasterData.some(b => b.branchCode === normalized);
  let v = true;
  if (!isValidBranch) {
      setFieldError("bgBranchField", true);
      const errorEl = document.querySelector(`#bgBranchField .err-msg`);
      if(errorEl) errorEl.textContent = "كود الفرع غير موجود (Branch code not found)";
      v = false;
  }

  const name = sanitizeText(el("bgProdName").value.trim(), 200);
  const code = sanitizeText(el("bgProdCode").value.trim(), 60);
  const status = el("bgStatus").value;
  const qtyVal = parseInt(el("bgQty").value, 10);

  if(!code){ setFieldError("bgProdCodeField",true); v=false; }
  if(!name){ setFieldError("bgProdNameField",true); v=false; }
  if(!status){ setFieldError("bgStatusField",true); v=false; }
  if(isNaN(qtyVal) || qtyVal < 1 || qtyVal > 10000){ setFieldError("bgQtyField",true); v=false; }
  
  if(!v) return;
  setFieldError("bgQtyField",false);

  bgRequestItems.push({
    tempId: Date.now() + Math.random(),
    productName: name, productCode: code, status: status, quantity: qtyVal
  });
  
  // Professional Button Interaction
  const btn = el("bgAddProductBtn");
  const originalText = btn.innerHTML;
  btn.innerHTML = `<svg class="ui-icon" aria-hidden="true"><use href="#icon-check"></use></svg> تمت الإضافة بنجاح`;
  btn.style.background = "var(--c-success)";
  btn.style.pointerEvents = "none";
  
  setTimeout(() => {
    btn.innerHTML = originalText;
    btn.style.background = "";
    btn.style.pointerEvents = "auto";
  }, 800);

  el("bgProdName").value=""; el("bgProdCode").value=""; el("bgStatus").value=""; el("bgQty").value=""; 
  renderBgProductsList();
});

function renderBgProductsList(){
  const wrap = el("bgProductsList");
  if(!bgRequestItems.length){
    el("bgEmptyState").style.display="block"; el("bgSummaryBar").style.display="none"; el("bgSubmitRequestBtn").disabled=true; wrap.innerHTML=""; return;
  }
  el("bgEmptyState").style.display="none"; el("bgSummaryBar").style.display="flex"; el("bgSubmitRequestBtn").disabled=false;
  
  let totalQty = 0;
  wrap.innerHTML = bgRequestItems.map((item, index)=>{
    totalQty += item.quantity;
    const isNew = index === bgRequestItems.length - 1;
    return `<div class="product-row ${isNew ? 'animate-row' : ''}">
      <div class="pr-main">
        <div class="pr-name">${escapeHtml(item.productName)}</div>
        <div class="pr-meta">
          <span>الكود: <code style="font-family:monospace; background:transparent;">${escapeHtml(item.productCode)}</code></span> 
          <span class="pr-qty">الكمية: ${item.quantity}</span> 
          <span class="${item.status === 'عرض' ? 'badge review' : 'badge done'}" style="margin:0; padding:3px 8px; font-size:11px;">${escapeHtml(item.status)}</span>
        </div>
      </div>
      <div class="pr-actions">
        <button type="button" class="btn btn-warning btn-icon" data-edit-bg-product="${item.tempId}" title="تعديل" aria-label="تعديل ${escapeHtml(item.productName)}" style="background:#fef3c7;color:#b45309; border:1px solid #fde68a;"><svg class="ui-icon" aria-hidden="true"><use href="#icon-edit"></use></svg></button>
        <button type="button" class="btn btn-danger btn-icon" data-remove-bg-product="${item.tempId}" title="إزالة من القائمة" aria-label="إزالة ${escapeHtml(item.productName)} من القائمة" style="background:#fee2e2;color:#b91c1c; border:1px solid #fecaca;"><svg class="ui-icon" aria-hidden="true"><use href="#icon-trash"></use></svg></button>
      </div>
    </div>`;
  }).join("");
  el("bgSumCount").textContent = bgRequestItems.length;
  el("bgSumQty").textContent = totalQty;
}

function removeBgProduct(id){ bgRequestItems = bgRequestItems.filter(i=>i.tempId!==id); renderBgProductsList(); }
function editBgProduct(id){
  const item = bgRequestItems.find(i=>i.tempId===id);
  if(item) {
    el("bgProdName").value = item.productName; el("bgProdCode").value = item.productCode;
    el("bgStatus").value = item.status; el("bgQty").value = item.quantity;
    removeBgProduct(id);
    window.scrollTo({ top: el("bgProdCodeField").offsetTop - 60, behavior: 'smooth' });
  }
}
el("bgProductsList").addEventListener("click", event => {
  const button = event.target.closest("[data-edit-bg-product], [data-remove-bg-product]");
  if (!button) return;
  const id = Number(button.dataset.editBgProduct || button.dataset.removeBgProduct);
  if (!Number.isFinite(id)) return;
  if (button.hasAttribute("data-edit-bg-product")) editBgProduct(id);
  else removeBgProduct(id);
});

el("bgSubmitRequestBtn").addEventListener("click", ()=>{
  const branch = el("bgBranchCode").value.trim();
  const normalized = normalizeBranchCode(branch);
  const branchObj = branchesMasterData.find(b => b.branchCode === normalized);
  if(!branch || !branchObj){ 
      setFieldError("bgBranchField",true); showToast("كود الفرع غير صحيح","error"); window.scrollTo(0,0); return; 
  }
  setFieldError("bgBranchField",false);
  el("bgCfBranch").textContent = `${normalized} - ${branchObj.branchName}`; 
  el("bgCfCount").textContent = bgRequestItems.length; 
  el("bgCfQty").textContent = bgRequestItems.reduce((s,i)=>s+i.quantity,0);
  
  // Professional Structured Modal Table
  el("bgCfProducts").innerHTML = bgRequestItems.map(i=>`
    <tr>
      <td style="font-weight:700;">${escapeHtml(i.productName)}</td>
      <td><code>${escapeHtml(i.productCode)}</code></td>
      <td><span class="badge ${i.status === 'عرض' ? 'review' : 'done'}">${escapeHtml(i.status)}</span></td>
      <td style="font-weight:800; color:var(--c-primary); text-align:center;">${i.quantity}</td>
    </tr>`).join("");
  
  el("bgConfirmModalTitle").textContent = currentEditBgOrderId ? "مراجعة وتحديث تقرير بضاعة الفرع" : "مراجعة تقرير بضاعة الفرع";
  el("bgConfirmSendBtn").textContent = currentEditBgOrderId ? "تأكيد التحديث" : "تأكيد وحفظ التقرير";
  
  el("bgConfirmModal").classList.add("open");
});

document.querySelectorAll("[data-close-bg]").forEach(b=>b.addEventListener("click", ()=>el("bgConfirmModal").classList.remove("open")));

el("bgConfirmSendBtn").addEventListener("click", async ()=>{
  if(!navigator.onLine) return showToast("لا يوجد اتصال بالإنترنت", "error");
  const btn = el("bgConfirmSendBtn"); btn.disabled = true; btn.innerHTML = `<span class="loader"></span> جارٍ الحفظ...`;

  try{
    const branchVal = el("bgBranchCode").value.trim();
    const normalizedBranch = normalizeBranchCode(branchVal);
    const branchObj = branchesMasterData.find(b => b.branchCode === normalizedBranch);
    const realBranchName = branchObj ? branchObj.branchName : "";

    const docData = {
      type: "branch_goods", branchName: normalizedBranch, realBranchName: realBranchName, branchCode: normalizedBranch, status: "مكتمل",
      products: bgRequestItems.map(p => ({
        productName: sanitizeText(p.productName, 200), productCode: sanitizeText(p.productCode, 60), status: p.status, quantity: Math.max(1, Number(p.quantity) || 1)
      })),
      productsCount: bgRequestItems.length, totalQuantity: bgRequestItems.reduce((s,p)=>s+p.quantity,0), updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    let savedOrderId = currentEditBgOrderId;
    const isEditing = !!currentEditBgOrderId;

    if (isEditing) {
        await db.collection(REQUESTS_COLLECTION).doc(currentEditBgOrderId).update(docData);
        const existingLocal = await appStorage.getOrder(currentEditBgOrderId);
        await saveSentRequestToLS({ ...existingLocal, ...docData, id: currentEditBgOrderId, type: "branch_goods" });
        showToast("تم تحديث بضاعة الفرع بنجاح", "success");
    } else {
        docData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        const docRef = await db.collection(REQUESTS_COLLECTION).add(docData);
        savedOrderId = docRef.id;
        await saveSentRequestToLS({ ...docData, id: docRef.id, type: "branch_goods", createdAtMillis: Date.now() });
        showToast("تم إرسال بضاعة الفرع بنجاح", "success");
    }

    bgRequestItems = []; renderBgProductsList(); el("bgConfirmModal").classList.remove("open");
    currentEditBgOrderId = null; el("bgSubmitRequestBtn").innerHTML = `<svg class="ui-icon" aria-hidden="true"><use href="#icon-send"></use></svg> مراجعة وإرسال بضاعة الفرع`;
    el("bgEditOrderActions").style.display = "none"; el("bgSentOrdersDropdown").value = "";

  }catch(err){ showToast("تعذر الإرسال، يرجى المحاولة مرة أخرى", "error"); }
  finally{ btn.disabled = false; btn.innerHTML = currentEditBgOrderId ? "تأكيد التحديث" : "تأكيد وحفظ التقرير"; }
});

el("bgSentOrdersDropdown").addEventListener("change", (e) => { el("bgEditOrderActions").style.display = e.target.value ? "flex" : "none"; });

el("bgLoadOrderBtn").addEventListener("click", async () => {
    const id = el("bgSentOrdersDropdown").value; if(!id) return;
    const order = await appStorage.getOrder(id); if(!order) return showToast("تعذر تحميل التقرير", "error");

    currentEditBgOrderId = order.id;
    el("bgBranchCode").value = order.branchCode || order.branchName;
    processBranchInput("bgBranchCode", "bgBranchCodeDisplayField", "bgBranchCodeDisplay", false);
    
    bgRequestItems = (order.products || []).map(p => ({ ...p, tempId: p.tempId || Date.now() + Math.random() }));
    renderBgProductsList();
    
    el("bgSubmitRequestBtn").innerHTML = `<svg class="ui-icon" aria-hidden="true"><use href="#icon-history"></use></svg> مراجعة وتحديث بضاعة الفرع`; el("bgSubmitRequestBtn").disabled = false;
    showToast("تم تحميل التقرير للتعديل", "success"); window.scrollTo({ top: 0, behavior: 'smooth' });
});

el("bgCancelEditBtn").addEventListener("click", () => {
    currentEditBgOrderId = null; bgRequestItems = []; renderBgProductsList();
    el("bgSentOrdersDropdown").value = ""; el("bgEditOrderActions").style.display = "none";
    el("bgSubmitRequestBtn").innerHTML = `<svg class="ui-icon" aria-hidden="true"><use href="#icon-send"></use></svg> مراجعة وإرسال بضاعة الفرع`; showToast("تم إلغاء التعديل", "info");
});

/* ==========================================================================
   Excel Export: Perfected 7-Column Layout Matching User Screenshot Exactly
   ========================================================================== */
el("bgDownloadExcelBtn").addEventListener("click", async () => {
  if (!window.ExcelJS) return showToast("خطأ في مكتبة تصدير الإكسيل", "error");
  
  const branchVal = el("bgBranchCode").value.trim();
  const normalizedBranch = normalizeBranchCode(branchVal);
  const branchObj = branchesMasterData.find(b => b.branchCode === normalizedBranch);
  const realBranchName = branchObj ? branchObj.branchName : "";
  
  if(!bgRequestItems.length) return showToast("القائمة فارغة، لا يمكن التحميل", "warn");
  
  try {
    const wb = new ExcelJS.Workbook();
    // إنشاء الشيت باتجاه من اليمين لليسار (RTL)
    const sheet = wb.addWorksheet("بضاعة الفرع", { views: [{ rightToLeft: true }] });

    // تحديد أبعاد الأعمدة السبعة بدقة
    sheet.columns = [
      { key: 'date', width: 16 },
      { key: 'bCode', width: 15 },
      { key: 'bName', width: 22 },
      { key: 'pCode', width: 25 },
      { key: 'pName', width: 68 },
      { key: 'status', width: 14 },
      { key: 'qty', width: 12 }
    ];

    // الصف 1: رؤوس الأعمدة تماماً كما في الصورة المرجعية
    const headerRow = sheet.addRow([
      'التاريخ',
      'كود الفرع',
      'اسم الفرع',
      'كود المنتج',
      'اسم المنتج',
      'الحاله',
      'الكميه'
    ]);
    headerRow.height = 25;

    // تنسيق صف العناوين: خلفية رمادية، خط أسود عريض، وتوسيط وحدود سوداء
    headerRow.eachCell((cell) => {
      cell.font = { name: 'Arial', bold: true, size: 12, color: { argb: 'FF000000' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFBFBFBF' } }; // رمادي مطابق للصورة
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = { 
        top: { style: 'thin', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FF000000' } },
        bottom: { style: 'thin', color: { argb: 'FF000000' } },
        right: { style: 'thin', color: { argb: 'FF000000' } }
      };
    });

    // تجهيز التاريخ بصيغة dd/mm/yyyy مطابقة للصورة
    const now = new Date();
    const dateStr = `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth()+1).toString().padStart(2, '0')}/${now.getFullYear()}`;

    // إضافة البيانات صفاً تلو الآخر
    bgRequestItems.forEach(item => {
      const row = sheet.addRow([
        dateStr,
        sanitizeExcelCell(normalizedBranch),
        sanitizeExcelCell(realBranchName),
        sanitizeExcelCell(item.productCode),
        sanitizeExcelCell(item.productName),
        sanitizeExcelCell(item.status),
        Number(item.quantity) || 1
      ]);
      row.height = 22;

      row.eachCell((cell, colNumber) => {
        cell.font = { name: 'Arial', size: 11, color: { argb: 'FF000000' } };
        // توسيط الأعمدة ما عدا اسم المنتج يمين (لأنه عربي وطويل)
        cell.alignment = { 
          horizontal: colNumber === 5 ? 'right' : 'center', 
          vertical: 'middle', 
          wrapText: true 
        };
        cell.border = { 
          top: { style: 'thin', color: { argb: 'FF000000' } },
          left: { style: 'thin', color: { argb: 'FF000000' } },
          bottom: { style: 'thin', color: { argb: 'FF000000' } },
          right: { style: 'thin', color: { argb: 'FF000000' } }
        };
      });
    });

    // العلامة المائية الرسمية المعتمدة في تذييل الصفحة وسطر منفصل أدنى الجدول
    sheet.headerFooter.oddFooter = "&C&\"Arial\"&9 FOX TEAM BY AbdElmoneim";
    sheet.addRow([]); // سطر فارغ فاصل
    const wmRow = sheet.addRow(['', '', '', '', 'FOX TEAM BY AbdElmoneim', '', '']);
    wmRow.getCell(5).font = { name: 'Arial', italic: true, size: 9, color: { argb: 'FF999999' } };
    wmRow.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };

    const buf = await wb.xlsx.writeBuffer();
    saveAs(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `بضاعة_الفرع_${normalizedBranch}_${new Date().getTime()}.xlsx`);
    showToast("تم تحميل الإكسيل بنجاح وبشكل صحيح", "success");
  } catch(e) {
    console.error(e);
    showToast("حدث خطأ أثناء استخراج ملف الإكسيل", "error");
  }
});


/* ==========================================================================
   7. Modals & Utilities for Regular Order Display
   ========================================================================== */
function displayOrderSuccessModal(summary) {
  if (!summary) return;
  el("osModalTitle").textContent = summary.isEdit ? "تم تحديث الطلب بنجاح" : "تم إرسال الطلب بنجاح";
  el("osStatus").textContent = summary.status || (summary.isEdit ? "معدّل" : "جديد");
  el("osTotalCount").textContent = summary.totalCount;
  el("osTotalQty").textContent = summary.totalQty;

  const tbody = el("osTableBody");
  tbody.innerHTML = summary.products.map(p => `
    <tr>
      <td style="font-weight:700;">#${escapeHtml(summary.shortId)}</td>
      <td style="text-align:right;font-weight:700;">
        ${escapeHtml(p.productName)}
        <div style="font-size:10.5px;color:var(--c-text-muted);font-weight:normal;">كود: ${escapeHtml(p.productCode)}</div>
      </td>
      <td style="font-weight:800;color:var(--c-primary);">${p.quantity}</td>
      <td>${escapeHtml(summary.branchDisplay)}</td>
      <td style="font-size:11.5px;">${escapeHtml(summary.timeStr)}</td>
      <td style="font-size:11.5px;">${escapeHtml(summary.dateStr)}</td>
    </tr>
  `).join("");

  el("orderSuccessModal").classList.add("open");
}

document.querySelectorAll("[data-close-success]").forEach(b => {
  b.addEventListener("click", () => el("orderSuccessModal").classList.remove("open"));
});

async function generateOrderSummaryBlob(summary) {
  return new Promise((resolve) => {
    const scale = 2; const width = 740; const rowHeight = 42; const headerHeight = 160; const summaryHeight = 85; const footerHeight = 65; const tableHeaderHeight = 45;
    const itemsCount = summary.products.length; const height = headerHeight + tableHeaderHeight + (itemsCount * rowHeight) + summaryHeight + footerHeight;

    const canvas = document.createElement("canvas"); canvas.width = width * scale; canvas.height = height * scale;
    const ctx = canvas.getContext("2d"); ctx.scale(scale, scale);

    ctx.fillStyle = "#FFFFFF"; ctx.fillRect(0, 0, width, height);
    const gradient = ctx.createLinearGradient(0, 0, width, 0); gradient.addColorStop(0, "#0D1A30"); gradient.addColorStop(0.6, "#006EFF"); gradient.addColorStop(1, "#3F9BF7");
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, 110);

    ctx.fillStyle = "#FFFFFF"; ctx.font = "bold 22px 'Cairo', sans-serif"; ctx.textAlign = "right"; ctx.fillText("📦 نظام طلب البضاعة - العربى", width - 30, 42);
    ctx.font = "bold 12px 'Cairo', sans-serif"; ctx.fillStyle = "rgba(255, 255, 255, 0.85)"; ctx.fillText("FOX TEAM BY AbdElmoneim", width - 30, 68);

    ctx.fillStyle = "#FCFBF8"; ctx.fillRect(20, 118, width - 40, 36); ctx.strokeStyle = "#cbd5e1"; ctx.lineWidth = 1; ctx.strokeRect(20, 118, width - 40, 36);
    ctx.fillStyle = "#1F2933"; ctx.font = "bold 13px 'Cairo', sans-serif"; ctx.fillText(`رقم الطلب: #${summary.shortId}`, width - 35, 142);
    ctx.fillText(`الفرع: ${summary.branchDisplay}`, width - 230, 142); ctx.fillText(`التاريخ: ${summary.dateStr}  ${summary.timeStr}`, width - 520, 142);

    let currentY = 165; ctx.fillStyle = "#F1EFE8"; ctx.fillRect(20, currentY, width - 40, tableHeaderHeight); ctx.strokeStyle = "#cbd5e1"; ctx.strokeRect(20, currentY, width - 40, tableHeaderHeight);
    ctx.fillStyle = "#0D1A30"; ctx.font = "bold 13px 'Cairo', sans-serif";
    ctx.fillText("رقم الطلب", width - 35, currentY + 28); ctx.fillText("اسم المنتج / الموديل", width - 130, currentY + 28); ctx.fillText("الكمية", width - 420, currentY + 28);
    ctx.fillText("المخزن", width - 510, currentY + 28); ctx.fillText("التاريخ والوقت", width - 610, currentY + 28);

    currentY += tableHeaderHeight;
    summary.products.forEach((p, idx) => {
      ctx.fillStyle = idx % 2 === 0 ? "#FFFFFF" : "#FCFBF8"; ctx.fillRect(20, currentY, width - 40, rowHeight); ctx.strokeStyle = "#E4E0D6"; ctx.strokeRect(20, currentY, width - 40, rowHeight);
      ctx.fillStyle = "#1F2933"; ctx.font = "bold 12px 'Cairo', sans-serif"; ctx.fillText(`#${summary.shortId}`, width - 35, currentY + 26);
      let pName = p.productName; if(pName.length > 30) pName = pName.substring(0, 28) + "...";
      ctx.fillText(pName, width - 130, currentY + 26); ctx.fillStyle = "#006EFF"; ctx.font = "bold 13px 'Cairo', sans-serif"; ctx.fillText(String(p.quantity), width - 410, currentY + 26);
      ctx.fillStyle = "#1F2933"; ctx.font = "11.5px 'Cairo', sans-serif"; ctx.fillText(p.warehouseName || p.warehouseId || "-", width - 510, currentY + 26);
      ctx.fillText(`${summary.dateStr}`, width - 610, currentY + 26); currentY += rowHeight;
    });

    currentY += 10; ctx.fillStyle = "#0D1A30"; ctx.fillRect(20, currentY, width - 40, 48);
    ctx.fillStyle = "#FFFFFF"; ctx.font = "bold 14px 'Cairo', sans-serif"; ctx.fillText(`إجمالي الأصناف المطلوبة: ${summary.totalCount}`, width - 40, currentY + 30);
    ctx.fillStyle = "#3F9BF7"; ctx.fillText(`إجمالي الكميات: ${summary.totalQty}`, width - 340, currentY + 30); ctx.fillStyle = "#48D597"; ctx.fillText("الحالة: مسجل بالنظام ✅", width - 530, currentY + 30);
    currentY += 60; ctx.fillStyle = "#6B7480"; ctx.font = "11px 'Cairo', sans-serif"; ctx.fillText("تم استخراج هذا الإشعار إلكترونياً عبر نظام طلب البضاعة © AbdElmoneim", width - 30, currentY + 15);
    canvas.toBlob(blob => resolve(blob), "image/png");
  });
}

el("osShareWhatsAppBtn").addEventListener("click", async () => {
  if (!lastConfirmedOrderSummary) return showToast("لا توجد بيانات ملخص للمشاركة", "warn");
  const summary = lastConfirmedOrderSummary;
  showToast("جارٍ إنشاء صورة الملخص وتجهيز المشاركة...", "info");

  try {
    const blob = await generateOrderSummaryBlob(summary); const fileName = `طلب_بضاعة_${summary.shortId}.png`; const file = new File([blob], fileName, { type: "image/png" });
    const textMsg = `📦 *ملخص طلب بضاعة العربى*\n🔢 *رقم الطلب:* #${summary.shortId}\n🏢 *الفرع:* ${summary.branchDisplay}\n📅 *التاريخ:* ${summary.dateStr} - ${summary.timeStr}\n📊 *عدد الأصناف:* ${summary.totalCount}\n🔢 *إجمالي الكميات:* ${summary.totalQty}\n✅ تم تسجيل الطلب بنجاح بنظام المخازن.`;

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ title: `ملخص طلب بضاعة #${summary.shortId}`, text: textMsg, files: [file] }); showToast("تم فتح المشاركة بنجاح", "success"); return; } 
      catch (shareErr) { if (shareErr.name === "AbortError") return; console.warn("Web Share failed:", shareErr); }
    }
    saveAs(blob, fileName); showToast("تم تنزيل صورة الملخص، جارٍ فتح واتساب...", "success");
    const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(textMsg + "\n\n(تم حفظ صورة الملخص في جهازك، يرجى إرفاقها)")}`;
    setTimeout(() => { window.open(waUrl, "_blank", "noopener,noreferrer"); }, 700);
  } catch(err) { showToast("حدث خطأ أثناء إعداد صورة الملخص", "error"); }
});

el("osDownloadImgBtn").addEventListener("click", async () => {
  if (!lastConfirmedOrderSummary) return showToast("لا توجد بيانات للتحميل", "warn");
  showToast("جارٍ استخراج صورة الملخص...", "info");
  try {
    const blob = await generateOrderSummaryBlob(lastConfirmedOrderSummary); saveAs(blob, `ملخص_طلب_${lastConfirmedOrderSummary.shortId}.png`);
    showToast("تم تحميل صورة الملخص بنجاح", "success");
  } catch(e) { showToast("تعذر تحميل الصورة", "error"); }
});

let orderIdToDelete = null;

async function openDeleteOrderDialog(id) {
  if(!id) return showToast("الرجاء اختيار طلب من القائمة أولاً", "warn");
  const order = await appStorage.getOrder(id); orderIdToDelete = id;
  const previewEl = el("deleteOrderDetailsPreview");
  if(order) {
    const bName = escapeHtml(order.realBranchName || order.branchName || order.branchCode);
    const pCount = order.productsCount || (order.products ? order.products.length : 0);
    const qCount = order.totalQuantity || order.quantity || 0;
    previewEl.innerHTML = `طلب رقم: <b style="color:var(--c-primary-dark);">#${escapeHtml(id.slice(0,8))}</b> للفرع: <b>${bName}</b><br><span style="display:inline-block;margin-top:4px;">(عدد ${pCount} أصناف - إجمالي ${qCount} قطعة)</span>`;
  } else { previewEl.innerHTML = `طلب رقم: <b>#${escapeHtml(id.slice(0,8))}</b>`; }
  el("deleteConfirmModal").classList.add("open");
}

document.querySelectorAll("[data-close-delete]").forEach(b => { b.addEventListener("click", () => el("deleteConfirmModal").classList.remove("open")); });

el("confirmDeleteOrderBtn").addEventListener("click", async () => {
  if(!orderIdToDelete) return;
  if(!navigator.onLine) return showToast("لا يوجد اتصال بالإنترنت لحذف الطلب", "error");
  const btn = el("confirmDeleteOrderBtn"); const origText = btn.innerHTML; btn.disabled = true; btn.innerHTML = `<span class="loader"></span> جاري الحذف...`;

  try {
    await db.collection(REQUESTS_COLLECTION).doc(orderIdToDelete).delete();
    await appStorage.deleteOrder(orderIdToDelete);
    await listenToSentRequests();
    if(currentEditOrderId === orderIdToDelete) { currentEditOrderId = null; requestItems = []; renderProductsList(); el("submitRequestBtn").innerHTML = `<svg class="ui-icon" aria-hidden="true"><use href="#icon-send"></use></svg> إرسال طلب البضاعة`; el("cancelEditBtn").style.display = "none"; }
    if(selectedSavedOrderId === orderIdToDelete) setSelectedSavedOrder(null);
    el("deleteConfirmModal").classList.remove("open");
    showToast("تم حذف الطلب بنجاح", "success");
  } catch(err) { showToast("تعذر حذف الطلب، يرجى المحاولة لاحقاً", "error"); } 
  finally { btn.disabled = false; btn.innerHTML = origText; orderIdToDelete = null; }
});


/* ==========================================================================
   8. Tabs Switcher
   ========================================================================== */
const tabButtons = Array.from(document.querySelectorAll('.tab-btn'));
function activateTab(btn, moveFocus = false) {
  tabButtons.forEach(tab => {
    const selected = tab === btn;
    tab.classList.toggle('active', selected);
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
  });
  document.querySelectorAll('.tab-content').forEach(panel => panel.classList.toggle('active', panel.id === btn.dataset.tab));
  if (moveFocus) btn.focus();
}
tabButtons.forEach((btn, index) => {
  btn.addEventListener('click', () => activateTab(btn));
  btn.addEventListener('keydown', event => {
    let targetIndex = index;
    if (event.key === 'ArrowLeft') targetIndex = (index + 1) % tabButtons.length;
    else if (event.key === 'ArrowRight') targetIndex = (index - 1 + tabButtons.length) % tabButtons.length;
    else if (event.key === 'Home') targetIndex = 0;
    else if (event.key === 'End') targetIndex = tabButtons.length - 1;
    else return;
    event.preventDefault();
    activateTab(tabButtons[targetIndex], true);
  });
});

/* ==========================================================================
   9. Dead Stock & Stagnant Sales Logic
   ========================================================================== */
let dsSelectedProductCode = "";
setupAc("dsProdName", "dsProdNameList", "productName", p => { 
  el("dsProdName").value = p.productName; dsSelectedProductCode = p.productCode;
  if(p.bundlePtkCode) { el("dsBundleCode").value = p.bundlePtkCode; el("dsBundleHelp").style.display = "none"; } 
  else { el("dsBundleCode").value = ""; el("dsBundleHelp").style.display = "block"; showToast("لا يوجد كود Bundle، يرجى إدخاله يدوياً", "warn"); }
});

el("dsSubmitBtn").addEventListener("click", async () => {
  const branch = el("dsBranchCode").value.trim(); const qty = el("dsQty").value;
  const prodName = sanitizeText(el("dsProdName").value.trim(), 200); const bundle = sanitizeText(el("dsBundleCode").value.trim(), 60);
  const normalizedBranch = normalizeBranchCode(branch); const branchObj = branchesMasterData.find(b => b.branchCode === normalizedBranch);

  if(!branchObj || !qty || !prodName || !bundle) {
    if(!branchObj) showToast("كود الفرع غير موجود", "error"); else showToast("يرجى إكمال جميع الحقول المطلوبة", "error"); return;
  }
  if(!navigator.onLine) return showToast("لا يوجد اتصال بالإنترنت", "error");

  const btn = el("dsSubmitBtn"); btn.disabled = true; btn.innerHTML = `<span class="loader"></span> جارٍ الإرسال...`;

  try {
    const docRef = await db.collection(REQUESTS_COLLECTION).add({
      type: "dead_stock", branchName: normalizedBranch, realBranchName: branchObj.branchName, branchCode: normalizedBranch,
      productName: prodName, productCode: dsSelectedProductCode, bundlePtkCode: bundle, quantity: parseInt(qty, 10), status: "جديد", createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await saveSentRequestToLS({
      id: docRef.id, type: "dead_stock", branchName: normalizedBranch, realBranchName: branchObj.branchName, branchCode: normalizedBranch,
      productName: prodName, productCode: dsSelectedProductCode, bundlePtkCode: bundle, quantity: parseInt(qty, 10),
      products: [{ productName: prodName, productCode: dsSelectedProductCode, bundlePtkCode: bundle, quantity: parseInt(qty, 10), warehouseId: "راكد", warehouseName: "رصيد راكد" }],
      totalQuantity: parseInt(qty, 10), status: "جديد", createdAtMillis: Date.now()
    });

    showToast("تم إرسال الرصيد الراكد بنجاح", "success"); el("dsQty").value = ""; el("dsProdName").value = ""; el("dsBundleCode").value = "";
    el("dsBundleHelp").style.display = "none"; dsSelectedProductCode = "";
  } catch (err) { showToast("تعذر إرسال الرصيد الراكد", "error"); } finally { btn.disabled = false; btn.innerHTML = `<svg class="ui-icon" aria-hidden="true"><use href="#icon-send"></use></svg> إرسال الرصيد الراكد`; }
});

setupAc("ssProdName", "ssProdNameList", "productName", p => { el("ssProdName").value = p.productName; el("ssProdCode").value = p.productCode; setFieldError("ssProdNameField", false); setFieldError("ssProdCodeField", false); });
setupAc("ssProdCode", "ssProdCodeList", "productCode", p => { el("ssProdName").value = p.productName; el("ssProdCode").value = p.productCode; setFieldError("ssProdNameField", false); setFieldError("ssProdCodeField", false); });

let stagnantSalesItems = []; let lastSubmittedSSData = null;

el("ssAddProductBtn").addEventListener("click", () => {
  const branch = el("ssBranchName").value.trim(); const name = sanitizeText(el("ssProdName").value.trim(), 200); const code = sanitizeText(el("ssProdCode").value.trim(), 60);
  const qtyVal = parseInt(el("ssQty").value, 10); const salesRaw = el("ssTotalSales").value.trim(); const sales = salesRaw === "" ? "" : parseFloat(salesRaw);
  
  const normalized = normalizeBranchCode(branch); const isValidBranch = branchesMasterData.some(b => b.branchCode === normalized); let v = true;
  if(!branch || !isValidBranch) { setFieldError("ssBranchField", true); const errorEl = document.querySelector(`#ssBranchField .err-msg`); if(errorEl) errorEl.textContent = "كود الفرع غير موجود (Branch code not found)"; v = false; } else setFieldError("ssBranchField", false);

  if(!name) { setFieldError("ssProdNameField", true); v = false; }
  if(!code) { setFieldError("ssProdCodeField", true); v = false; }
  if(isNaN(qtyVal) || qtyVal < 1 || qtyVal > 100) { setFieldError("ssQtyField", true); v = false; }
  if(sales !== "" && (isNaN(sales) || sales < 0)) { showToast("قيمة المبيعات غير صحيحة", "warn"); v = false; }
  if(!v) return;
  
  stagnantSalesItems.push({ tempId: Date.now() + Math.random(), branchName: normalized, productName: name, productCode: code, quantity: qtyVal, totalSales: sales === "" ? "" : sales });
  el("ssProdName").value = ""; el("ssProdCode").value = ""; el("ssQty").value = ""; el("ssTotalSales").value = ""; renderStagnantSalesList();
});

function renderStagnantSalesList() {
  const wrap = el("ssProductsList");
  if(!stagnantSalesItems.length){ el("ssEmptyState").style.display = "block"; el("ssSummaryBar").style.display = "none"; el("ssSubmitBtn").disabled = true; wrap.innerHTML = ""; return; }
  el("ssEmptyState").style.display = "none"; el("ssSummaryBar").style.display = "flex"; el("ssSubmitBtn").disabled = false;
  
  let sumSales = 0;
  wrap.innerHTML = stagnantSalesItems.map((item, idx) => {
    const salesDisplay = item.totalSales === "" ? "غير محدد" : item.totalSales; if (typeof item.totalSales === "number") sumSales += item.totalSales;
    const isNew = idx === stagnantSalesItems.length - 1;
    return `<div class="product-row ${isNew ? 'animate-row' : ''}"><div class="pr-main"><div class="pr-name">${escapeHtml(item.productName)}</div><div class="pr-meta"><span>الكود: ${escapeHtml(item.productCode)}</span><span class="pr-qty">الكمية: ${item.quantity}</span><span>المبيعات: ${escapeHtml(salesDisplay)}</span></div></div><div class="pr-actions"><button type="button" class="btn btn-danger btn-icon" data-remove-ss-product="${item.tempId}" title="إزالة" aria-label="إزالة ${escapeHtml(item.productName)}"><svg class="ui-icon" aria-hidden="true"><use href="#icon-trash"></use></svg></button></div></div>`;
  }).join("");
  el("ssSumCount").textContent = stagnantSalesItems.length; el("ssSumSales").textContent = sumSales;
}
function removeSSProduct(id) { stagnantSalesItems = stagnantSalesItems.filter(i => i.tempId !== id); renderStagnantSalesList(); }
el("ssProductsList").addEventListener("click", event => {
  const button = event.target.closest("[data-remove-ss-product]");
  if (!button) return;
  const id = Number(button.dataset.removeSsProduct);
  if (Number.isFinite(id)) removeSSProduct(id);
});

el("ssSubmitBtn").addEventListener("click", async () => {
  if(!navigator.onLine) return showToast("لا يوجد اتصال بالإنترنت", "error"); if(!stagnantSalesItems.length) return;
  const branchVal = el("ssBranchName").value.trim(); const normalizedBranch = normalizeBranchCode(branchVal); const branchObj = branchesMasterData.find(b => b.branchCode === normalizedBranch);
  if(!branchObj){ setFieldError("ssBranchField", true); showToast("أدخل كود الفرع", "error"); window.scrollTo(0,0); return; }
  
  const btn = el("ssSubmitBtn"); const oldHtml = btn.innerHTML; btn.disabled = true; btn.innerHTML = `<span class="loader"></span> جارٍ الإرسال...`;
  try {
    const totalQty = stagnantSalesItems.reduce((s, p) => s + p.quantity, 0); const overallSales = stagnantSalesItems.reduce((s, p) => s + (typeof p.totalSales === 'number' ? p.totalSales : 0), 0);
    const docData = { type: "stagnant_sales", branchName: normalizedBranch, realBranchName: branchObj.branchName, branchCode: normalizedBranch, status: "جديد", products: stagnantSalesItems.map(item => ({ productName: sanitizeText(item.productName, 200), productCode: sanitizeText(item.productCode, 60), quantity: item.quantity, totalSales: item.totalSales })), productsCount: stagnantSalesItems.length, totalQuantity: totalQty, totalSales: overallSales, createdAt: firebase.firestore.FieldValue.serverTimestamp() };
    const docRef = await db.collection(REQUESTS_COLLECTION).add(docData);
    await saveSentRequestToLS({ ...docData, id: docRef.id, createdAtMillis: Date.now() }); showToast("تم إرسال مبيعات الرواكد بنجاح", "success");
    lastSubmittedSSData = { date: new Date(), branch: normalizedBranch, items: [...stagnantSalesItems] }; showSSSuccessView(); stagnantSalesItems = []; renderStagnantSalesList();
  } catch(err) { showToast("تعذر إرسال تقرير المبيعات", "error"); } finally { btn.disabled = false; btn.innerHTML = oldHtml; }
});

function showSSSuccessView() {
    el("ssFormCard1").style.display = "none"; el("ssFormCard2").style.display = "none"; el("ssFormCard3").style.display = "none"; el("ssSubmitBtn").style.display = "none";
    const tbody = el("ssSuccessTableBody"); const dateStr = lastSubmittedSSData.date.toLocaleDateString('ar-EG');
    let html = ""; let sumTotal = 0;
    lastSubmittedSSData.items.forEach(item => {
      const salesStr = item.totalSales === "" ? "-" : item.totalSales; if(typeof item.totalSales === 'number') sumTotal += item.totalSales;
      html += `<tr><td style="padding:10px; border-bottom:1px solid #e2e8f0;">${escapeHtml(dateStr)}</td><td style="padding:10px; border-bottom:1px solid #e2e8f0;">${escapeHtml(item.branchName)}</td><td style="padding:10px; border-bottom:1px solid #e2e8f0;">${escapeHtml(item.productName)}</td><td style="padding:10px; border-bottom:1px solid #e2e8f0; font-weight:800;">${item.quantity}</td><td style="padding:10px; border-bottom:1px solid #e2e8f0; color:var(--c-success); font-weight:800;">${escapeHtml(salesStr)}</td></tr>`;
    });
    html += `<tr style="background:var(--c-success-bg);"><td colspan="4" style="padding:12px 14px; font-weight:800; text-align:left;">إجمالي المبيعات المرسلة:</td><td style="padding:12px 14px; font-weight:800; color:var(--c-success);">${sumTotal}</td></tr>`;
    tbody.innerHTML = html; el("ssSuccessView").style.display = "block"; window.scrollTo(0,0);
}

el("ssNewReportBtn").addEventListener("click", () => { el("ssSuccessView").style.display = "none"; el("ssFormCard1").style.display = "block"; el("ssFormCard2").style.display = "block"; el("ssFormCard3").style.display = "block"; el("ssSubmitBtn").style.display = "block"; lastSubmittedSSData = null; window.scrollTo(0,0); });

el("ssDownloadExcelBtn").addEventListener("click", async () => {
    if(!lastSubmittedSSData || !window.ExcelJS) return showToast("تعذر تصدير الملف", "error");
    try {
      const wb = new ExcelJS.Workbook(); const sheet = wb.addWorksheet("مبيعات الرواكد", { views: [{ rightToLeft: true }] });
      sheet.columns = [ { header: 'التاريخ', key: 'date', width: 15 }, { header: 'الفرع', key: 'branch', width: 20 }, { header: 'المنتج', key: 'product', width: 40 }, { header: 'الكمية', key: 'qty', width: 10 }, { header: 'إجمالي المبيعات', key: 'sales', width: 20 } ];
      const headerRow = sheet.getRow(1); headerRow.height = 24;
      headerRow.eachCell((cell) => { cell.font = { name: 'Cairo', bold: true, size: 12, color: { argb: 'FF000000' } }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } }; cell.alignment = { horizontal: 'center', vertical: 'middle' }; cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} }; });
      
      const now = new Date();
      const dateStr = `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth()+1).toString().padStart(2, '0')}/${now.getFullYear()}`;
      
      let totalSalesSum = 0;
      lastSubmittedSSData.items.forEach(item => { const salesVal = item.totalSales === "" ? "-" : item.totalSales; if(typeof item.totalSales === "number") totalSalesSum += item.totalSales;
          const row = sheet.addRow({
            date: dateStr,
            branch: sanitizeExcelCell(item.branchName),
            product: sanitizeExcelCell(`${item.productName} (${item.productCode})`),
            qty: item.quantity,
            sales: salesVal
          });
          row.height = 20; row.eachCell((cell) => { cell.font = { name: 'Cairo', size: 11 }; cell.alignment = { horizontal: 'center', vertical: 'middle' }; cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} }; });
      });
      const totalRow = sheet.addRow({ date: '', branch: '', product: '', qty: 'الإجمالي:', sales: totalSalesSum });
      totalRow.eachCell((cell) => { cell.font = { name: 'Cairo', bold: true, size: 12, color: { argb: 'FF2F855A' } }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE7F5EC' } }; cell.alignment = { horizontal: 'center', vertical: 'middle' }; cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} }; });
      const buf = await wb.xlsx.writeBuffer(); saveAs(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `Stagnant_Stock_Sales_${new Date().getTime()}.xlsx`); showToast("تم تصدير الإكسيل بنجاح", "success");
    } catch(e) { showToast("حدث خطأ أثناء تصدير الإكسيل", "error"); }
});

/* ==========================================================================
   10. Live Firestore Listener & Local History
   ========================================================================== */
const COMPLETED_NOTIFICATION_STATE_KEY = "tb_completed_order_notifications_v1";
function getCompletedNotificationStates() {
  try {
    const value = JSON.parse(localStorage.getItem(COMPLETED_NOTIFICATION_STATE_KEY) || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch (error) { return {}; }
}

function saveCompletedNotificationState(eventKey, state, details) {
  const states = getCompletedNotificationStates();
  states[eventKey] = { ...details, state };
  try { localStorage.setItem(COMPLETED_NOTIFICATION_STATE_KEY, JSON.stringify(states)); } catch (error) {}
}

function updateCompletedNotificationButton() {
  const button = el("enableCompletedNotificationsBtn");
  const label = el("completedNotificationPermissionText");
  if (!button || !label) return;
  if (!("Notification" in window) || Notification.permission === "granted") {
    button.style.display = "none";
    button.disabled = true;
    return;
  }
  button.style.display = "inline-flex";
  if (Notification.permission === "denied") {
    button.disabled = true;
    label.textContent = "الإشعارات محظورة من إعدادات المتصفح";
  } else {
    button.disabled = false;
    label.textContent = "تفعيل إشعارات اكتمال الطلبات";
  }
}

async function showCompletedOrderNotification(eventKey, details) {
  const previous = getCompletedNotificationStates()[eventKey];
  if (previous && previous.state !== "pending") return;
  if (!("Notification" in window)) {
    saveCompletedNotificationState(eventKey, "dismissed", details);
    showToast(`${details.title}: ${details.body}`, "info");
    return;
  }
  if (Notification.permission !== "granted") {
    saveCompletedNotificationState(eventKey, "pending", details);
    showToast("اكتمل طلب. فعّل إشعارات اكتمال الطلبات لاستلام التنبيه.", "info");
    return;
  }

  try {
    let registration = null;
    if ("serviceWorker" in navigator) {
      try { registration = await navigator.serviceWorker.getRegistration(); } catch (error) {}
    }
    if (registration && registration.showNotification) {
      try {
        await registration.showNotification(details.title, {
          body: details.body,
          tag: eventKey,
          renotify: false,
          data: { eventKey }
        });
        saveCompletedNotificationState(eventKey, "shown", details);
        return;
      } catch (error) {}
    }

    const notification = new Notification(details.title, { body: details.body, tag: eventKey, renotify: false });
    saveCompletedNotificationState(eventKey, "shown", details);
    notification.onclose = () => saveCompletedNotificationState(eventKey, "dismissed", details);
    notification.onclick = () => { window.focus(); notification.close(); };
  } catch (error) {
    saveCompletedNotificationState(eventKey, "pending", details);
    console.error("Completed-order notification failed", error);
    showToast("تعذر عرض الإشعار الآن؛ سيعاد المحاولة عند تفعيل الإشعارات", "warn");
  }
}

async function deliverPendingCompletedNotifications() {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  for (const [eventKey, record] of Object.entries(getCompletedNotificationStates())) {
    if (record && record.state === "pending") await showCompletedOrderNotification(eventKey, record);
  }
}

el("enableCompletedNotificationsBtn").addEventListener("click", async () => {
  if (!("Notification" in window)) return showToast("متصفحك لا يدعم الإشعارات", "warn");
  try {
    const permission = await Notification.requestPermission();
    updateCompletedNotificationButton();
    if (permission === "granted") {
      await deliverPendingCompletedNotifications();
      showToast("تم تفعيل إشعارات اكتمال الطلبات", "success");
    } else {
      showToast("لم يتم السماح بإشعارات المتصفح", "warn");
    }
  } catch (error) { showToast("تعذر تفعيل الإشعارات", "error"); }
});
updateCompletedNotificationButton();
deliverPendingCompletedNotifications();
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("message", event => {
    const message = event.data;
    if (!message || !message.eventKey || !["completed-notification-click", "completed-notification-close"].includes(message.type)) return;
    const states = getCompletedNotificationStates();
    const details = states[message.eventKey];
    if (details) saveCompletedNotificationState(message.eventKey, "dismissed", details);
    if (message.type === "completed-notification-click") window.focus();
  });
}

let sentRequestsUnsub = null;
async function listenToSentRequests(){
  const localOrders = await appStorage.getAllOrders();
  const now = Date.now(); const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
  
  const activeLocalOrders = [];
  for (const order of localOrders) {
    let isExpired = false;
    if (order.status === "مكتمل") {
      const completedTime = order.completedAtMillis || order.updatedAtMillis || order.createdAtMillis || 0;
      if (completedTime > 0 && (now - completedTime > TWENTY_FOUR_HOURS_MS)) isExpired = true;
    }
    if (isExpired) await appStorage.deleteOrder(order.id); else activeLocalOrders.push(order);
  }
  renderSentHistory(activeLocalOrders);

  if(sentRequestsUnsub) { sentRequestsUnsub(); sentRequestsUnsub = null; }
  const ids = getSentRequestIds();
  if(ids.length === 0) return;

  sentRequestsUnsub = db.collection(REQUESTS_COLLECTION).where(firebase.firestore.FieldPath.documentId(), "in", ids.slice(-30))
    .onSnapshot(async (snap) => {
      const currentNow = Date.now();
      const existingDocIds = new Set(snap.docs.map(doc => doc.id));
      for (const qId of ids.slice(-30)) { if (!existingDocIds.has(qId)) await appStorage.deleteOrder(qId); }
      for (const change of snap.docChanges()) { if (change.type === "removed") await appStorage.deleteOrder(change.doc.id); }

      for (const doc of snap.docs) {
        const d = doc.data(); const id = doc.id; let isExpired = false;
        let completedAtMillis = d.completedAt ? (typeof d.completedAt.toMillis === "function" ? d.completedAt.toMillis() : d.completedAt) : null;
        let updatedAtMillis = d.updatedAt ? (typeof d.updatedAt.toMillis === "function" ? d.updatedAt.toMillis() : d.updatedAt) : null;
        if (d.status === "مكتمل") {
          const completedTime = completedAtMillis || updatedAtMillis || 0;
          if (completedTime > 0 && (currentNow - completedTime > TWENTY_FOUR_HOURS_MS)) isExpired = true;
        }
        if (isExpired) await appStorage.deleteOrder(id);
        else {
          const existing = await appStorage.getOrder(id) || {};
          if (d.status === "مكتمل" && (!d.type || d.type === "order") && existing.status !== "مكتمل") {
            const eventKey = `${id}:${completedAtMillis || updatedAtMillis || currentNow}`;
            const branchName = String(d.realBranchName || d.branchName || d.branchCode || "").slice(0, 100);
            await showCompletedOrderNotification(eventKey, {
              title: "اكتمل الطلب",
              body: `اكتمل الطلب رقم ${id.slice(0, 8)}${branchName ? ` للفرع ${branchName}` : ""}.`
            });
          }
          await appStorage.saveOrder({
            ...existing, ...d, id, status: d.status || existing.status || "جديد",
            completedAtMillis: completedAtMillis || existing.completedAtMillis,
            updatedAtMillis: updatedAtMillis || existing.updatedAtMillis,
            createdAtMillis: d.createdAt ? (typeof d.createdAt.toMillis === "function" ? d.createdAt.toMillis() : Date.now()) : (existing.createdAtMillis || Date.now())
          });
        }
      }
      renderSentHistory(await appStorage.getAllOrders());
    });
}

function renderSentHistory(docs){
  // 1. Regular Orders
  const orderCard = el("sentHistoryCard");
  const savedOrdersList = el("savedOrdersList");
  const showMoreButton = el("showMoreSavedOrdersBtn");
  if(orderCard && savedOrdersList && showMoreButton) {
    const regularOrders = docs
      .filter(r => !r.type || r.type === "order")
      .sort((a, b) => (b.createdAtMillis || 0) - (a.createdAtMillis || 0));
    if(regularOrders.length) {
      orderCard.style.display = "block";
      const visibleOrders = showAllSavedOrders ? regularOrders : regularOrders.slice(0, 3);
      savedOrdersList.innerHTML = visibleOrders.map(r => {
         const dateStr = r.createdAtMillis ? new Date(r.createdAtMillis).toLocaleDateString("ar-EG") : "";
         const timeStr = r.createdAtMillis ? new Date(r.createdAtMillis).toLocaleTimeString("ar-EG", {hour:'2-digit', minute:'2-digit'}) : "";
         const bName = escapeHtml(r.realBranchName || r.branchName || r.branchCode);
         const status = escapeHtml(r.status || "جديد");
         const orderId = escapeHtml(r.id);
         return `<div class="saved-order-row">
           <button type="button" class="saved-order-open" data-edit-saved-order="${orderId}" aria-pressed="${r.id === selectedSavedOrderId}">
             <span class="saved-order-heading"><span>طلب #${escapeHtml(r.id.slice(0,8))}</span><span class="saved-order-status">الحالة: ${status}</span></span>
             <span class="saved-order-details">${bName} | ${escapeHtml(dateStr)} ${escapeHtml(timeStr)}</span>
           </button>
           <button type="button" class="btn btn-danger btn-icon saved-order-delete" data-delete-saved-order="${orderId}" title="حذف الطلب" aria-label="حذف الطلب رقم ${escapeHtml(r.id.slice(0,8))}"><svg class="ui-icon" aria-hidden="true"><use href="#icon-trash"></use></svg></button>
         </div>`;
      }).join("");
      showMoreButton.style.display = regularOrders.length > 3 ? "block" : "none";
      showMoreButton.textContent = showAllSavedOrders ? "عرض أقل" : `عرض المزيد (${Math.max(0, regularOrders.length - 3)})`;
    } else {
      orderCard.style.display="none";
      savedOrdersList.innerHTML = "";
      showMoreButton.style.display = "none";
      showAllSavedOrders = false;
    }
  }

  // 2. Branch Goods Reports
  const bgCard = el("bgSentHistoryCard");
  const bgDropdown = el("bgSentOrdersDropdown");
  if(bgCard && bgDropdown) {
    const bgOrders = docs.filter(r => r.type === "branch_goods");
    if(bgOrders.length) {
      bgCard.style.display = "block";
      let bgHtml = `<option value="">-- اختر تقرير سابق لعرضه أو تعديله --</option>`;
      bgOrders.forEach(r => {
         const dateStr = r.createdAtMillis ? new Date(r.createdAtMillis).toLocaleDateString("ar-EG") : "";
         const timeStr = r.createdAtMillis ? new Date(r.createdAtMillis).toLocaleTimeString("ar-EG", {hour:'2-digit', minute:'2-digit'}) : "";
         const bName = escapeHtml(r.realBranchName || r.branchName || r.branchCode);
         bgHtml += `<option value="${escapeHtml(r.id)}">تقرير بضاعة فرع #${escapeHtml(r.id.slice(0,8))} - ${bName} - ${escapeHtml(dateStr)} ${escapeHtml(timeStr)}</option>`;
      });
      const currentBgVal = bgDropdown.value;
      bgDropdown.innerHTML = bgHtml;
      bgDropdown.value = currentEditBgOrderId && bgOrders.some(x=>x.id === currentEditBgOrderId) ? currentEditBgOrderId : (currentBgVal && bgOrders.some(x=>x.id === currentBgVal) ? currentBgVal : "");
    } else {
      bgCard.style.display="none";
    }
  }
}

listenToSentRequests();

/* ==========================================================================
   11. Non-Intrusive Anti-Tampering & Copyright Protection
   ========================================================================== */
(function protectApp() {
  const AUTHOR_NAME = "AbdElmoneim"; const SYSTEM_NAME = "نظام طلب البضاعة";
  document.addEventListener("keydown", (e) => {
    const isInput = ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName);
    if (!isInput) {
      if (e.key === "F12" || e.keyCode === 123) { e.preventDefault(); return false; }
      if (e.ctrlKey && e.shiftKey && ["I","J","C"].includes(e.key?.toUpperCase())) { e.preventDefault(); return false; }
      if (e.ctrlKey && e.key?.toLowerCase() === "u") { e.preventDefault(); return false; }
    }
  });
  function enforceCopyright() {
    const expectedText = `${SYSTEM_NAME} © جميع الحقوق محفوظة "${AUTHOR_NAME}" ${new Date().getFullYear()}`;
    document.querySelectorAll(".footer-note").forEach(note => { if (!note || note.textContent.trim() !== expectedText.trim()) note.textContent = expectedText; });
  }
  setInterval(enforceCopyright, 2000); window.addEventListener("load", enforceCopyright);
})();

/* ==========================================================================
   12. PWA Engine & Service Worker Integration
   ========================================================================== */
let deferredPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferredPrompt = e; });
const pwaBtn = document.getElementById("pwaInstallBtn");
if (pwaBtn) {
  pwaBtn.addEventListener("click", async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      if ((await deferredPrompt.userChoice).outcome === "accepted") { localStorage.setItem("pwa_installed", "true"); checkPwaVisibility(); showToast("تم تثبيت التطبيق بنجاح على جهازك", "success"); }
      deferredPrompt = null; return;
    }
    if (window.location.protocol === "file:") return alert("⚠️ التثبيت المباشر بنقرة واحدة يتطلب رفع الموقع على رابط HTTPS");
    if (/iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream) return alert("📱 لتثبيت التطبيق على الآيفون:\n\n1. اضغط على زر المشاركة ( 📤 ) بأسفل الشاشة.\n2. اختر 'إضافة إلى الشاشة الرئيسية' (Add to Home Screen).");
    alert("📱 لتثبيت التطبيق:\nاضغط على القائمة ( ⋮ ) ثم اختر 'تثبيت التطبيق' أو 'Add to Home Screen'");
  });
}
function isPwaInstalled() { return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true || localStorage.getItem("pwa_installed") === "true"; }
function checkPwaVisibility() { const card = document.getElementById("pwaInstallCard"); if (card) card.style.display = isPwaInstalled() ? "none" : "flex"; }
window.addEventListener("appinstalled", () => { localStorage.setItem("pwa_installed", "true"); checkPwaVisibility(); });
checkPwaVisibility();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js")
      .then(() => deliverPendingCompletedNotifications())
      .catch(error => console.error("Service worker registration failed", error));
  });
}