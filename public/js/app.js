const state = { user: null, currentComplaint: null };
const PAGE_SIZE = 8;
let complaintFilters = { category: '', status: '', q: '', page: 1 };
let vendorComplaintFilters = { category: '', status: '', q: '', page: 1 };
let vendorViewTab = 'filed'; // 'filed' = complaints I raised myself, 'assigned' = complaints routed to me
const MANUFACTURE_CATEGORIES = ['Defence & Strategic Systems','Industrial Electronics & IT','Railway Technologies','Renewable Energy'];
const DIRECT_CATEGORIES = ['HR','Payment','General'];
const ALL_COMPLAINT_CATEGORIES = [...MANUFACTURE_CATEGORIES, ...DIRECT_CATEGORIES];
const COMPLAINT_STATUSES = ['Open','Assigned','Vendor Resolved','Disputed','Solved'];
function statusClass(status){ return status==='Solved' ? 'solved' : (status==='Disputed' ? 'disputed' : (status==='Vendor Resolved' ? 'pending' : 'unsolved')); }
const portal = document.getElementById('portal');
const publicSite = document.getElementById('publicSite');
const accountButton = document.getElementById('accountButton');

const businessAreas = [
  ['☀','Renewable Energy','Integrated solar manufacturing, energy storage and turnkey project execution.'],
  ['◉','Railway Technologies','Indigenous axle-counter and signalling solutions supporting safer rail networks.'],
  ['◆','Defence & Strategic Systems','High-reliability strategic electronics and advanced indigenous components.'],
  ['▦','Digital Infrastructure','Data centres, secure digital platforms and smart infrastructure solutions.'],
  ['⚙','Integrated Engineering','Technology integration across surveillance, IoT and command centres.'],
  ['⌁','Research & Development','Applied R&D that converts scientific capability into scalable products.']
];
const businessSlugs=['renewable-energy','railway-technologies','defence-strategic','digital-infrastructure','integrated-engineering','research-development'];
document.getElementById('businessGrid').innerHTML = businessAreas.map((x,i) => `<article class="business-card"><div class="business-icon">${x[0]}</div><h3>${x[1]}</h3><p>${x[2]}</p><a href="#page-${businessSlugs[i]}" data-page="${businessSlugs[i]}">Read More →</a></article>`).join('');

const news = [
  ['26 Jun','Leadership update and strategic priorities announced for CEL','NEW'],
  ['18 Jun','Expression of Interest invited for renewable-energy partnerships','NEW'],
  ['04 Jun','CEL participates in national technology and innovation exhibition',''],
  ['27 May','Vendor registration and procurement information updated','']
];
document.getElementById('newsList').innerHTML = news.map(n => `<article class="news-item"><div class="news-date">${n[0]}</div><h3>${n[1]}</h3>${n[2] ? `<span class="new-badge">${n[2]}</span>` : ''}</article>`).join('');

function toast(message, error=false){
  const el=document.getElementById('toast'); el.textContent=message; el.className=`toast show${error?' error':''}`;
  setTimeout(()=>el.className='toast',3200);
}
async function api(url, options={}){
  const response=await fetch(url,options);
  const data=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(data.error||'Something went wrong.');
  return data;
}
async function loadSession(){
  const data=await api('/api/auth/me'); state.user=data.user; updateAccountButton();
}
function updateAccountButton(){
  accountButton.textContent=state.user ? `${state.user.name.split(' ')[0]} · Dashboard` : 'Login';
}
function openPortal(){
  publicSite.classList.add('hidden'); portal.classList.remove('hidden'); window.scrollTo({top:0,behavior:'smooth'});
  renderPortal();
}
function closePortal(){
  portal.classList.add('hidden'); publicSite.classList.remove('hidden'); location.hash='#home';
}
function renderPortal(){
  if(!state.user) return renderAuth();
  if(state.currentComplaint) return renderComplaintDetail(state.currentComplaint);
  return state.user.role==='admin' ? renderAdminDashboard() : renderUserDashboard();
}
function portalHeader(title, subtitle=''){
  return `<div class="portal-shell"><div class="portal-top"><div><span class="eyebrow">CEL Service Portal</span><h1>${title}</h1>${subtitle?`<p>${subtitle}</p>`:''}</div><div class="form-actions"><button class="btn btn-ghost" id="backToSite">Public Website</button>${state.user?'<button class="btn btn-ghost" id="logoutBtn">Logout</button>':''}</div></div><div id="portalContent"></div></div>`;
}
function bindCommon(){
  document.getElementById('backToSite')?.addEventListener('click',closePortal);
  document.getElementById('logoutBtn')?.addEventListener('click',async()=>{await api('/api/auth/logout',{method:'POST'});state.user=null;state.currentComplaint=null;complaintFilters={category:'',status:'',q:'',page:1};vendorComplaintFilters={category:'',status:'',q:'',page:1};vendorViewTab='filed';updateAccountButton();renderAuth();toast('Logged out successfully.');});
}
function renderAuth(mode='login'){
  portal.innerHTML=portalHeader('CEL Query & Complaint Portal','Register as a Vendor/Seller or Consumer, verify your email and track your queries securely.');
  const content=document.getElementById('portalContent');
  content.innerHTML=`<div class="portal-card auth-wrap"><div class="tabs"><button class="${mode==='login'?'active':''}" id="loginTab">Login</button><button class="${mode==='register'?'active':''}" id="registerTab">Register</button></div><div id="authForm"></div></div>`;
  bindCommon();
  document.getElementById('loginTab').onclick=()=>renderAuth('login'); document.getElementById('registerTab').onclick=()=>renderAuth('register');
  if(mode==='login') renderLoginForm(); else renderRegisterForm();
}
function renderLoginForm(){
  document.getElementById('authForm').innerHTML=`<form id="loginForm"><div class="form-group"><label>Email</label><input type="email" name="email" required autocomplete="email"></div><div class="form-group"><label>Password</label><input type="password" name="password" required autocomplete="current-password"></div><button class="btn btn-accent full">Login securely</button><button type="button" class="link-button" id="forgotPasswordLink" style="margin-top:12px">Forgot password?</button><p class="form-help">Demo admin: admin@cel.local / Admin@12345. Change this password before deployment.</p></form>`;
  document.getElementById('loginForm').onsubmit=async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));try{const d=await api('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(f)});state.user=d.user;updateAccountButton();toast(d.message);renderPortal();}catch(err){toast(err.message,true)}};
  document.getElementById('forgotPasswordLink').onclick=renderForgotPasswordForm;
}
function renderForgotPasswordForm(){
  document.getElementById('authForm').innerHTML=`<h3>Reset your password</h3><p>Enter the email on your account and we'll send a reset code.</p><form id="forgotForm"><div class="form-group"><label>Email</label><input type="email" name="email" required autocomplete="email"></div><button class="btn btn-accent full">Send reset code</button></form><button class="link-button" id="backToLogin" style="margin-top:12px">← Back to login</button>`;
  document.getElementById('backToLogin').onclick=()=>renderLoginForm();
  document.getElementById('forgotForm').onsubmit=async e=>{e.preventDefault();const email=new FormData(e.target).get('email');try{const d=await api('/api/auth/forgot-password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})});toast(d.mockOtp?`${d.message} Mock code: ${d.mockOtp}`:d.message);renderResetPasswordForm(email,d.mockOtp);}catch(err){toast(err.message,true)}};
}
function renderResetPasswordForm(email,mockOtp){
  document.getElementById('authForm').innerHTML=`<h3>Enter your reset code</h3><p>Enter the 6-digit code sent to <strong>${email}</strong> and choose a new password.</p>${mockOtp?`<p class="form-help"><strong>Mock email mode:</strong> code is ${mockOtp}</p>`:''}<form id="resetForm"><div class="form-group"><label>Reset code</label><input name="code" inputmode="numeric" maxlength="6" pattern="[0-9]{6}" required></div><div class="form-group"><label>New password</label><input type="password" name="newPassword" required minlength="8"><span class="form-help">At least 8 characters with uppercase, lowercase and a number.</span></div><button class="btn btn-accent full">Set new password</button></form><button class="link-button" id="resendReset" style="margin-top:12px">Resend code</button>`;
  document.getElementById('resetForm').onsubmit=async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));try{const d=await api('/api/auth/reset-password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,code:f.code,newPassword:f.newPassword})});toast(d.message);renderAuth('login');}catch(err){toast(err.message,true)}};
  document.getElementById('resendReset').onclick=async()=>{try{const d=await api('/api/auth/forgot-password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})});toast(d.mockOtp?`${d.message} Mock code: ${d.mockOtp}`:d.message);}catch(err){toast(err.message,true)}};
}
function renderRegisterForm(){
  document.getElementById('authForm').innerHTML=`<form id="registerForm"><div class="form-group"><label>Full name</label><input name="name" required minlength="2"></div><div class="form-group" id="userTypeGroup"><label>Register as</label><select name="userType" id="userTypeInput" required><option value="">Select account type</option><option value="vendor">Vendor / Seller</option><option value="consumer">Consumer / Customer</option></select><span class="form-help">Choose Vendor/Seller if you supply goods or services to CEL. Choose Consumer/Customer if you are raising a complaint as a customer of CEL.</span></div><div class="form-group" id="categoryGroup" style="display:none"><label>Manufacture category</label><select name="category" id="categoryInput"><option value="">Select category</option>${MANUFACTURE_CATEGORIES.map(c=>`<option value="${c}">${c}</option>`).join('')}</select><span class="form-help">The CEL manufacturing vertical you supply to (Vendor) or purchase from (Consumer). This is used to route your complaints to the right team.</span></div><div class="form-group" id="vendorIdGroup" style="display:none"><label>Seller / Vendor ID</label><input name="vendorId" id="vendorIdInput" minlength="3" maxlength="30" placeholder="e.g. VEND-1042"><span class="form-help">Your registered CEL Seller/Vendor ID. Used to match your queries to company records.</span></div><div class="form-group"><label>Original email address</label><input type="email" name="email" required></div><div class="form-group"><label>Password</label><input type="password" name="password" required minlength="8"><span class="form-help">At least 8 characters with uppercase, lowercase and a number.</span></div><div class="form-group"><label>Admin access code <span style="font-weight:400;color:var(--muted)">(CEL staff only — leave blank if you're a vendor or consumer)</span></label><input name="adminCode" id="adminCodeInput" autocomplete="off"></div><button class="btn btn-accent full">Create account</button></form>`;
  const userTypeGroup=document.getElementById('userTypeGroup');
  const userTypeInput=document.getElementById('userTypeInput');
  const categoryGroup=document.getElementById('categoryGroup');
  const categoryInput=document.getElementById('categoryInput');
  const vendorIdGroup=document.getElementById('vendorIdGroup');
  const vendorIdInput=document.getElementById('vendorIdInput');
  userTypeInput.addEventListener('change',e=>{
    const isVendor=e.target.value==='vendor';
    const hasType=Boolean(e.target.value);
    categoryGroup.style.display=hasType?'':'none';
    categoryInput.required=hasType;
    vendorIdGroup.style.display=isVendor?'':'none';
    vendorIdInput.required=isVendor;
    if(!isVendor) vendorIdInput.value='';
  });
  document.getElementById('adminCodeInput').addEventListener('input',e=>{
    const isAdminSignup=e.target.value.trim().length>0;
    userTypeGroup.style.display=isAdminSignup?'none':'';
    userTypeInput.required=!isAdminSignup;
    categoryGroup.style.display=(isAdminSignup||!userTypeInput.value)?'none':'';
    categoryInput.required=!isAdminSignup&&Boolean(userTypeInput.value);
    vendorIdGroup.style.display=(isAdminSignup||userTypeInput.value!=='vendor')?'none':'';
    vendorIdInput.required=!isAdminSignup&&userTypeInput.value==='vendor';
  });
  document.getElementById('registerForm').onsubmit=async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));try{const d=await api('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(f)});toast(d.message);renderOtp(f.email,d.mockOtp);}catch(err){toast(err.message,true)}};
}
function renderOtp(email,mockOtp){
  document.getElementById('authForm').innerHTML=`<h3>Verify your email</h3><p>Enter the 6-digit OTP sent to <strong>${email}</strong>.</p>${mockOtp?`<p class="form-help"><strong>Mock email mode:</strong> OTP is ${mockOtp}</p>`:''}<form id="otpForm"><div class="form-group"><label>OTP</label><input name="otp" inputmode="numeric" maxlength="6" pattern="[0-9]{6}" required></div><button class="btn btn-accent full">Verify email</button></form><button class="link-button" id="resendOtp">Resend OTP</button>`;
  document.getElementById('otpForm').onsubmit=async e=>{e.preventDefault();try{const otp=new FormData(e.target).get('otp');const d=await api('/api/auth/verify-otp',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,otp})});toast(d.message);renderAuth('login');}catch(err){toast(err.message,true)}};
  document.getElementById('resendOtp').onclick=async()=>{try{const d=await api('/api/auth/resend-otp',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})});toast(d.mockOtp?`${d.message} Mock OTP: ${d.mockOtp}`:d.message);}catch(err){toast(err.message,true)}};
}
function complaintsQuery(filters=complaintFilters, scope=''){
  const params=new URLSearchParams();
  if(filters.category) params.set('category',filters.category);
  if(filters.status) params.set('status',filters.status);
  if(filters.q) params.set('q',filters.q);
  if(scope) params.set('scope',scope);
  params.set('page',filters.page);
  params.set('pageSize',PAGE_SIZE);
  return params.toString();
}
function filterBarHtml(filters=complaintFilters, prefix=''){
  return `<div class="filter-bar">
    <input type="text" id="${prefix}filterSearch" placeholder="Search by subject…" value="${filters.q}">
    <select id="${prefix}filterCategory"><option value="">All categories</option>${ALL_COMPLAINT_CATEGORIES.map(c=>`<option value="${c}" ${filters.category===c?'selected':''}>${c}</option>`).join('')}</select>
    <select id="${prefix}filterStatus"><option value="">All statuses</option>${COMPLAINT_STATUSES.map(s=>`<option value="${s}" ${filters.status===s?'selected':''}>${s}</option>`).join('')}</select>
    <button class="btn btn-ghost" id="${prefix}filterApply">Filter</button>
    <button class="btn btn-ghost" id="${prefix}filterClear">Clear</button>
  </div>`;
}
function bindFilterBar(reload, filters=complaintFilters, prefix=''){
  document.getElementById(`${prefix}filterApply`).onclick=()=>{
    filters.q=document.getElementById(`${prefix}filterSearch`).value.trim();
    filters.category=document.getElementById(`${prefix}filterCategory`).value;
    filters.status=document.getElementById(`${prefix}filterStatus`).value;
    filters.page=1;
    reload();
  };
  document.getElementById(`${prefix}filterClear`).onclick=()=>{
    filters.category='';filters.status='';filters.q='';filters.page=1;
    reload();
  };
}
function paginationHtml(total, filters=complaintFilters, prefix=''){
  const totalPages=Math.max(1,Math.ceil(total/PAGE_SIZE));
  return `<div class="pagination"><button class="btn btn-ghost" id="${prefix}prevPage" ${filters.page<=1?'disabled':''}>← Prev</button><span>Page ${filters.page} of ${totalPages} · ${total} total</span><button class="btn btn-ghost" id="${prefix}nextPage" ${filters.page>=totalPages?'disabled':''}>Next →</button></div>`;
}
function bindPagination(total,reload,filters=complaintFilters,prefix=''){
  const totalPages=Math.max(1,Math.ceil(total/PAGE_SIZE));
  document.getElementById(`${prefix}prevPage`).onclick=()=>{if(filters.page>1){filters.page--;reload();}};
  document.getElementById(`${prefix}nextPage`).onclick=()=>{if(filters.page<totalPages){filters.page++;reload();}};
}
async function renderUserDashboard(){
  const isVendor=state.user.userType==='vendor';
  portal.innerHTML=portalHeader(`Welcome, ${state.user.name}`,isVendor?`Registered vendor · ${state.user.category||'—'}. View complaints you raised, and complaints admin has assigned to you.`:'View your submitted complaints and follow every update.');bindCommon();
  if(isVendor) await renderVendorDashboard(); else await loadUserComplaints();
}
async function loadUserComplaints(){
  const content=document.getElementById('portalContent'); content.innerHTML='<div class="portal-card">Loading complaints…</div>';
  try{
    const [summary,d]=await Promise.all([api('/api/complaints/summary'),api(`/api/complaints?${complaintsQuery()}`)]);
    content.innerHTML=`<div class="dashboard-head"><div class="stat-grid" style="flex:1"><div class="stat-card"><span>Total complaints</span><strong>${summary.total}</strong></div><div class="stat-card"><span>Solved</span><strong>${summary.solved}</strong></div><div class="stat-card"><span>Not solved yet</span><strong>${summary.unsolved}</strong></div></div><button class="btn btn-accent" id="newComplaint">+ Register Complaint</button></div><div class="portal-card"><h2>Your complaints</h2>${filterBarHtml()}${complaintTable(d.complaints,false)}${paginationHtml(d.total)}</div>`;
    document.getElementById('newComplaint').onclick=renderComplaintForm;
    bindViewButtons();
    bindFilterBar(loadUserComplaints);
    bindPagination(d.total,loadUserComplaints);
  }catch(err){content.innerHTML=`<div class="portal-card">${err.message}</div>`}
}
async function renderVendorDashboard(){
  const content=document.getElementById('portalContent');
  content.innerHTML=`<div class="tabs"><button id="vendorTabFiled" class="${vendorViewTab==='filed'?'active':''}">Complaints I raised</button><button id="vendorTabAssigned" class="${vendorViewTab==='assigned'?'active':''}">Assigned to me</button></div><div id="vendorTabContent"></div>`;
  document.getElementById('vendorTabFiled').onclick=()=>{vendorViewTab='filed';renderVendorDashboard();};
  document.getElementById('vendorTabAssigned').onclick=()=>{vendorViewTab='assigned';renderVendorDashboard();};
  if(vendorViewTab==='assigned') await loadVendorAssignedComplaints();
  else await loadVendorFiledComplaints();
}
async function loadVendorFiledComplaints(){
  const holder=document.getElementById('vendorTabContent'); holder.innerHTML='<div class="portal-card">Loading complaints…</div>';
  try{
    const [summary,d]=await Promise.all([api('/api/complaints/summary'),api(`/api/complaints?${complaintsQuery()}`)]);
    holder.innerHTML=`<div class="dashboard-head"><div class="stat-grid" style="flex:1"><div class="stat-card"><span>Total complaints</span><strong>${summary.total}</strong></div><div class="stat-card"><span>Solved</span><strong>${summary.solved}</strong></div><div class="stat-card"><span>Not solved yet</span><strong>${summary.unsolved}</strong></div></div><button class="btn btn-accent" id="newComplaint">+ Register Complaint</button></div><div class="portal-card"><h2>Complaints you raised</h2>${filterBarHtml()}${complaintTable(d.complaints,false)}${paginationHtml(d.total)}</div>`;
    document.getElementById('newComplaint').onclick=renderComplaintForm;
    bindViewButtons();
    bindFilterBar(loadVendorFiledComplaints);
    bindPagination(d.total,loadVendorFiledComplaints);
  }catch(err){holder.innerHTML=`<div class="portal-card">${err.message}</div>`}
}
async function loadVendorAssignedComplaints(){
  const holder=document.getElementById('vendorTabContent'); holder.innerHTML='<div class="portal-card">Loading assigned complaints…</div>';
  try{
    const [summary,d]=await Promise.all([api('/api/complaints/summary'),api(`/api/complaints?${complaintsQuery(vendorComplaintFilters,'assigned')}`)]);
    holder.innerHTML=`<div class="stat-grid"><div class="stat-card"><span>Awaiting your action</span><strong>${summary.assigned||0}</strong></div></div><div class="portal-card"><h2>Complaints routed to you by admin</h2><p class="form-help">These are Product Issue complaints from consumers in your category (${state.user.category||'—'}) that admin has assigned specifically to you.</p>${filterBarHtml(vendorComplaintFilters,'v_')}${complaintTable(d.complaints,true)}${paginationHtml(d.total,vendorComplaintFilters,'v_')}</div>`;
    bindViewButtons();
    bindFilterBar(loadVendorAssignedComplaints,vendorComplaintFilters,'v_');
    bindPagination(d.total,loadVendorAssignedComplaints,vendorComplaintFilters,'v_');
  }catch(err){holder.innerHTML=`<div class="portal-card">${err.message}</div>`}
}
function complainantTypeBadge(type){
  if(type==='vendor') return '<span class="tag tag-vendor">Vendor</span>';
  if(type==='consumer') return '<span class="tag tag-consumer">Consumer</span>';
  return '';
}
function complaintTable(rows,admin){
  if(!rows.length)return '<p>No complaints submitted yet.</p>';
  return `<div style="overflow:auto"><table class="data-table"><thead><tr><th>Complaint ID</th>${admin?'<th>Complainant</th>':''}<th>Subject</th><th>Type / Vendor</th><th>Date</th><th>Status</th><th></th></tr></thead><tbody>${rows.map(c=>`<tr><td><strong>${c.complaint_code}</strong></td>${admin?`<td>${c.user_name} ${complainantTypeBadge(c.complainant_type)}<br><small>${c.user_email}</small><br><small>${c.complainant_type==='vendor'?`Seller ID: ${c.seller_id||'—'}`:'Consumer / Customer'}</small></td>`:''}<td>${c.subject}<br><small>${c.category}</small></td><td><small>${c.complaint_type}</small>${c.complaint_type==='Product Issue'?`<br><small>${c.assigned_vendor_name?`→ ${c.assigned_vendor_name} (${c.assigned_vendor_code||'—'})`:'Not yet assigned'}</small>`:''}</td><td>${new Date(c.created_at+'Z').toLocaleDateString()}</td><td><span class="status ${statusClass(c.status)}">${c.status}</span></td><td><button class="link-button view-complaint" data-id="${c.complaint_code}">View →</button></td></tr>`).join('')}</tbody></table></div>`;
}
function bindViewButtons(){document.querySelectorAll('.view-complaint').forEach(b=>b.onclick=()=>{state.currentComplaint=b.dataset.id;renderPortal();});}
function renderComplaintForm(){
  portal.innerHTML=portalHeader('Register Complaint / Query','Provide clear information so the concerned team can respond effectively.');bindCommon();
  document.getElementById('portalContent').innerHTML=`<div class="portal-card auth-wrap"><form id="complaintForm" enctype="multipart/form-data">
    <div class="form-group">
      <label>What is this about?</label>
      <select name="complaintType" id="complaintTypeInput" required>
        <option value="">Select complaint type</option>
        <option value="Product Issue">Product / Quality issue (damaged, missing, or faulty items from a vendor)</option>
        <option value="Direct">Direct query (HR, Payment, or General — no vendor involved)</option>
      </select>
      <span class="form-help">Product/Quality issues are routed to admin and then to the responsible vendor. Direct queries stay with admin only.</span>
    </div>
    <div class="form-group" id="productCategoryGroup" style="display:none">
      <label>Category</label>
      <input value="${state.user?.category || ''}" disabled>
      <span class="form-help">Automatically set to your registered manufacture category, so this routes to the right vendor pool.</span>
    </div>
    <div class="form-group" id="directCategoryGroup" style="display:none">
      <label>Category</label>
      <select name="category" id="directCategoryInput"><option value="">Select category</option>${DIRECT_CATEGORIES.map(c=>`<option>${c}</option>`).join('')}</select>
    </div>
    <div class="form-group"><label>Subject</label><input name="subject" maxlength="160" required></div>
    <div class="form-group"><label>Description</label><textarea name="description" minlength="10" required placeholder="e.g. Received 5 boxes, 2 arrived damaged. Please arrange replacement."></textarea></div>
    <div class="form-group"><label>Optional attachment</label><input type="file" name="attachment" accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"><span class="form-help">PDF, image or Word document. Maximum 5 MB.</span></div>
    <div class="form-actions"><button class="btn btn-accent">Submit complaint</button><button type="button" class="btn btn-ghost" id="cancelComplaint">Cancel</button></div>
  </form></div>`;
  const complaintTypeInput=document.getElementById('complaintTypeInput');
  const productCategoryGroup=document.getElementById('productCategoryGroup');
  const directCategoryGroup=document.getElementById('directCategoryGroup');
  const directCategoryInput=document.getElementById('directCategoryInput');
  complaintTypeInput.addEventListener('change',e=>{
    const isProduct=e.target.value==='Product Issue';
    const isDirect=e.target.value==='Direct';
    productCategoryGroup.style.display=isProduct?'':'none';
    directCategoryGroup.style.display=isDirect?'':'none';
    directCategoryInput.required=isDirect;
    if(!isDirect) directCategoryInput.value='';
  });
  document.getElementById('cancelComplaint').onclick=()=>renderUserDashboard();
  document.getElementById('complaintForm').onsubmit=async e=>{e.preventDefault();try{const d=await api('/api/complaints',{method:'POST',body:new FormData(e.target)});toast(`${d.message} ID: ${d.complaintId}`);renderUserDashboard();}catch(err){toast(err.message,true)}};
}
async function renderAdminDashboard(){
  portal.innerHTML=portalHeader('Admin Dashboard','All registered complaints across CEL service categories.');bindCommon();
  await loadAdminComplaints();
}
async function loadAdminComplaints(){
  const content=document.getElementById('portalContent');content.innerHTML='<div class="portal-card">Loading dashboard…</div>';
  try{
    const [s,d]=await Promise.all([api('/api/admin/stats'),api(`/api/complaints?${complaintsQuery()}`)]);
    content.innerHTML=`<div class="stat-grid"><div class="stat-card"><span>Total complaints</span><strong>${s.total}</strong></div><div class="stat-card"><span>Solved</span><strong>${s.solved}</strong></div><div class="stat-card"><span>Not solved yet</span><strong>${s.unsolved}</strong></div><div class="stat-card"><span>Vendors · Consumers</span><strong>${s.vendors} · ${s.consumers}</strong></div><div class="stat-card"><span>Awaiting vendor assignment</span><strong>${s.awaitingAssignment}</strong></div><div class="stat-card"><span>With vendor</span><strong>${s.withVendor}</strong></div><div class="stat-card"><span>Disputed</span><strong>${s.disputed}</strong></div></div><div class="portal-card"><h2>All complaints</h2>${filterBarHtml()}${complaintTable(d.complaints,true)}${paginationHtml(d.total)}</div>`;
    bindViewButtons();
    bindFilterBar(loadAdminComplaints);
    bindPagination(d.total,loadAdminComplaints);
  }catch(err){content.innerHTML=`<div class="portal-card">${err.message}</div>`}
}
function routingStatusNote(c){
  if(c.complaint_type!=='Product Issue') return '';
  if(c.status==='Open') return '<p class="form-help">Waiting for admin to assign this to the responsible vendor.</p>';
  if(c.status==='Assigned') return `<p class="form-help">Assigned to <strong>${c.assigned_vendor_name}</strong> (${c.assigned_vendor_code||'—'}). Waiting for the vendor to resolve it.</p>`;
  if(c.status==='Vendor Resolved') return `<p class="form-help"><strong>${c.assigned_vendor_name}</strong> marked this resolved. Waiting for the consumer to confirm.</p>`;
  if(c.status==='Disputed') return `<p class="form-help">Consumer disputed the vendor's fix. Back with admin for review.</p>`;
  return '';
}
async function renderComplaintDetail(id){
  portal.innerHTML=portalHeader('Complaint Details',id);bindCommon();
  const content=document.getElementById('portalContent');content.innerHTML='<div class="portal-card">Loading complaint…</div>';
  try{
    const d=await api(`/api/complaints/${id}`);const c=d.complaint;
    const isAdmin=state.user.role==='admin';
    const isOwner=c.user_id===state.user.id;
    const isAssignedVendor=c.assigned_vendor_id===state.user.id;

    let sidebarHtml;
    if(isAdmin){
      sidebarHtml=`<aside class="portal-card"><h3>Admin controls</h3>
        ${c.complaint_type==='Product Issue' && ['Open','Disputed'].includes(c.status) ? `<form id="assignForm"><div class="form-group"><label>Assign to vendor (${c.category})</label><select name="assignedVendorId" id="vendorAssignSelect"><option value="">Loading vendors…</option></select></div><button class="btn btn-accent full">Assign vendor</button></form>` : ''}
        ${c.complaint_type==='Product Issue' && c.assigned_vendor_name ? `<p class="form-help">Currently assigned to <strong>${c.assigned_vendor_name}</strong> (${c.assigned_vendor_code||'—'})</p>` : ''}
        <form id="adminUpdate"><div class="form-group"><label>Status</label><select name="status">${(c.complaint_type==='Direct'?['Open','Solved']:COMPLAINT_STATUSES).map(s=>`<option ${c.status===s?'selected':''}>${s}</option>`).join('')}</select></div><div class="form-group"><label>Official remark</label><textarea name="adminRemark">${c.admin_remark||''}</textarea></div><button class="btn btn-accent full">Save update</button></form>
      </aside>`;
    } else if(isAssignedVendor && ['Assigned','Disputed'].includes(c.status)){
      sidebarHtml=`<aside class="portal-card"><h3>Resolve this complaint</h3><p class="form-help">Describe the fix (e.g. replacement boxes dispatched, new delivery reference) so the consumer can confirm.</p><form id="vendorResolveForm"><div class="form-group"><label>Resolution details</label><textarea name="vendorRemark" required minlength="4">${c.vendor_remark||''}</textarea></div><button class="btn btn-accent full">Mark as resolved</button></form></aside>`;
    } else if(isOwner && c.status==='Vendor Resolved'){
      sidebarHtml=`<aside class="portal-card"><h3>Confirm resolution</h3><p><strong>${c.assigned_vendor_name}</strong> reports: "${c.vendor_remark||''}"</p><p class="form-help">Confirm only once you have actually received the fix/replacement.</p><div class="form-actions"><button class="btn btn-accent" id="confirmBtn">✔ Confirm — issue resolved</button><button class="btn btn-ghost" id="disputeBtn">Still not resolved</button></div></aside>`;
    } else {
      sidebarHtml=`<aside class="portal-card"><h3>Tracking summary</h3><p>Currently marked <strong>${c.status}</strong>.</p>${routingStatusNote(c)}<p class="form-help">Add a follow-up comment if CEL needs more information.</p></aside>`;
    }

    content.innerHTML=`<div class="complaint-layout"><div class="portal-card"><div class="dashboard-head"><div><h2>${c.subject}</h2><span class="status ${statusClass(c.status)}">${c.status}</span></div><button class="btn btn-ghost" id="backDashboard">← Dashboard</button></div><dl class="detail-list"><dt>Complaint ID</dt><dd>${c.complaint_code}</dd><dt>Type</dt><dd>${c.complaint_type}</dd><dt>Category</dt><dd>${c.category}</dd><dt>Submitted by</dt><dd>${c.user_name} (${c.user_email}) ${complainantTypeBadge(c.complainant_type)}</dd>${c.complainant_type==='vendor'?`<dt>Seller / Vendor ID</dt><dd>${c.seller_id||'—'}</dd>`:''}<dt>Date</dt><dd>${new Date(c.created_at+'Z').toLocaleString()}</dd><dt>Description</dt><dd>${c.description}</dd>${c.attachment_path?`<dt>Attachment</dt><dd><a href="/uploads/${c.attachment_path}" target="_blank">${c.attachment_name}</a></dd>`:''}${c.complaint_type==='Product Issue'?`<dt>Assigned vendor</dt><dd>${c.assigned_vendor_name?`${c.assigned_vendor_name} (${c.assigned_vendor_code||'—'})`:'Not yet assigned'}</dd><dt>Vendor remark</dt><dd>${c.vendor_remark||'No vendor remark yet.'}</dd>`:''}<dt>Admin remark</dt><dd>${c.admin_remark||'No official remark added yet.'}</dd></dl><div class="comments"><h3>Conversation</h3><div id="commentList">${d.comments.length?d.comments.map(m=>`<div class="comment ${m.author_role==='admin'?'admin':''}"><strong>${m.author_name} · ${m.author_role}</strong><p>${m.body}</p><small>${new Date(m.created_at+'Z').toLocaleString()}</small></div>`).join(''):'<p>No comments yet.</p>'}</div><form id="commentForm"><div class="form-group"><label>Add follow-up comment</label><textarea name="body" required></textarea></div><button class="btn btn-accent">Post comment</button></form></div></div>${sidebarHtml}</div>`;

    document.getElementById('backDashboard').onclick=()=>{state.currentComplaint=null;renderPortal();};
    document.getElementById('commentForm').onsubmit=async e=>{e.preventDefault();try{await api(`/api/complaints/${id}/comments`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({body:new FormData(e.target).get('body')})});toast('Comment added.');renderComplaintDetail(id);}catch(err){toast(err.message,true)}};

    document.getElementById('adminUpdate')?.addEventListener('submit',async e=>{e.preventDefault();const payload=Object.fromEntries(new FormData(e.target));try{await api(`/api/admin/complaints/${id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});toast('Complaint updated.');renderComplaintDetail(id);}catch(err){toast(err.message,true)}});

    const vendorAssignSelect=document.getElementById('vendorAssignSelect');
    if(vendorAssignSelect){
      try{
        const vd=await api(`/api/admin/vendors?category=${encodeURIComponent(c.category)}`);
        vendorAssignSelect.innerHTML=vd.vendors.length ? `<option value="">Select vendor</option>${vd.vendors.map(v=>`<option value="${v.id}">${v.name} (${v.vendor_id})</option>`).join('')}` : '<option value="">No vendors registered in this category yet</option>';
      }catch(err){vendorAssignSelect.innerHTML='<option value="">Could not load vendors</option>';}
    }
    document.getElementById('assignForm')?.addEventListener('submit',async e=>{e.preventDefault();const assignedVendorId=new FormData(e.target).get('assignedVendorId');if(!assignedVendorId){toast('Select a vendor first.',true);return;}try{await api(`/api/admin/complaints/${id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({assignedVendorId})});toast('Vendor assigned.');renderComplaintDetail(id);}catch(err){toast(err.message,true)}});

    document.getElementById('vendorResolveForm')?.addEventListener('submit',async e=>{e.preventDefault();const vendorRemark=new FormData(e.target).get('vendorRemark');try{await api(`/api/vendor/complaints/${id}/resolve`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({vendorRemark})});toast('Marked resolved. Awaiting consumer confirmation.');renderComplaintDetail(id);}catch(err){toast(err.message,true)}});

    document.getElementById('confirmBtn')?.addEventListener('click',async()=>{try{const r=await api(`/api/complaints/${id}/confirm`,{method:'POST'});toast(r.message);renderComplaintDetail(id);}catch(err){toast(err.message,true)}});
    document.getElementById('disputeBtn')?.addEventListener('click',async()=>{try{const r=await api(`/api/complaints/${id}/dispute`,{method:'POST'});toast(r.message);renderComplaintDetail(id);}catch(err){toast(err.message,true)}});
  }catch(err){content.innerHTML=`<div class="portal-card">${err.message}</div>`}
}


const contentPages = {
  'history': ['History of CEL','About CEL','Central Electronics Limited was established to translate indigenous research into commercially viable technologies. This prototype page is ready for CEL’s approved historical milestones, photographs and archival documents.'],
  'vision-mission': ['Vision & Mission','About CEL','CEL’s vision is to be a trusted technology enterprise delivering indigenous, sustainable and high-reliability solutions. Add the formally approved vision, mission and values here.'],
  'board-directors': ['Board of Directors','About CEL','Display approved director profiles, designations, photographs and committee responsibilities on this page.'],
  'leadership': ['Leadership','About CEL','This section can list CEL’s senior leadership team with approved biographies, areas of responsibility and official photographs.'],
  'organisation-chart': ['Organisational Chart','About CEL','Upload or embed the approved organisational structure and provide an accessible text alternative.'],
  'annual-reports': ['Annual Reports','Governance','Publish annual reports by financial year with searchable PDF downloads and publication dates.'],
  'mou': ['Memoranda of Understanding','Governance','List approved MoUs, partner organisations, signing dates and related public documents.'],
  'policies': ['Policies','Governance','Provide CEL policies such as Code of Conduct, Risk Management, CSR and POSH in a searchable document library.'],
  'vigilance': ['Vigilance','Governance','Add vigilance contacts, notices, integrity information and approved public resources.'],
  'rti': ['Right to Information','Governance','Publish RTI officers, disclosure documents, application guidance and statutory information.'],
  'cel-presentation': ['CEL Presentation','Resources','Provide the latest approved corporate presentation and downloadable brochures.'],
  'contact': ['Contact CEL','Connect','Add CEL’s official address, telephone numbers, email contacts, office hours and map details.'],
  'csr': ['Corporate Social Responsibility','About CEL','Show approved CSR programmes, policies, impact reports and project highlights.'],
  'upi-payment': ['UPI Payment Gateway','Citizen Services','Insert CEL’s approved secure payment instructions or official gateway integration here.'],
  'renewable-energy': ['Renewable Energy','Strategic Business Vertical','CEL provides solar PV modules, systems integration, energy storage and turnkey renewable-energy solutions.'],
  'railway-technologies': ['Railway Technologies','Strategic Business Vertical','Present CEL’s railway safety, signalling and axle-counter product portfolio with technical brochures.'],
  'defence-strategic': ['Defence & Strategic Systems','Strategic Business Vertical','Show approved indigenous strategic-electronics capabilities and high-reliability product information.'],
  'digital-infrastructure': ['Digital Infrastructure','Strategic Business Vertical','Describe CEL’s secure digital platforms, data infrastructure and smart-system integration capabilities.'],
  'integrated-engineering': ['Integrated Engineering Solutions','Strategic Business Vertical','Highlight end-to-end engineering, surveillance, IoT and command-centre solutions.'],
  'research-development': ['Research & Development','Strategic Business Vertical','Show research facilities, technology programmes, patents, collaborations and innovation outcomes.'],
  'pv-cells-panels': ['PV Cells & Panels','Solar Products','Add approved module specifications, certifications, applications and enquiry information.'],
  'solar-power-plants': ['Solar Power Plants','Solar Products','Present rooftop, ground-mounted and turnkey solar-power project capabilities.'],
  'bipv-bess': ['BIPV & Battery Energy Storage','Solar Products','Describe building-integrated photovoltaics and battery energy-storage solutions.'],
  'solar-water-pumping': ['Solar Water Pumping','Solar Products','Add system capacities, applications, specifications and programme information.'],
  'lighting-mini-grids': ['Lighting & Mini Grids','Solar Products','Present street lighting, home lighting, lantern and mini-grid offerings.'],
  'security-surveillance': ['Security & Surveillance','Integrated Solutions','Describe CCTV, access control, analytics and integrated security capabilities.'],
  'iot-it-solutions': ['IoT & IT Solutions','Integrated Solutions','Show approved IoT platforms, dashboards, networking and IT-system integration offerings.'],
  'command-control': ['Command & Control Centre','Integrated Solutions','Present integrated command-centre architecture, monitoring and decision-support capabilities.'],
  'computer-assessment': ['Computer Based Assessment','Integrated Solutions','Describe secure assessment delivery, centre operations and technology support services.'],
  'railway-axle-counters': ['Railway Axle Counters','Railway Products','Add approved axle-counter models, applications, certifications and brochures.'],
  'piezoelectric-ceramics': ['Piezoelectric Ceramics','Strategic Electronics','Present approved piezoelectric materials, components and technical specifications.'],
  'microwave-electronics': ['Microwave Electronics','Strategic Electronics','Add CEL’s approved microwave components and application information.'],
  'furnace-oven': ['Furnace & Oven','Strategic Electronics','Present industrial furnace and oven products with approved specifications.'],
  'cel-brochures': ['CEL Brochures','Downloads','Provide a searchable list of approved product and corporate brochures.'],
  'media-coverage': ['Media Coverage','Press Kit','Publish approved media mentions and press coverage with dates and sources.'],
  'events-conferences': ['Events & Conferences','Press Kit','Show CEL participation in exhibitions, conferences and technology events.'],
  'certification': ['Certifications','Press Kit','Display approved quality, product and organisational certifications.'],
  'gallery': ['Gallery','Press Kit','Add approved photographs and videos grouped by event or business vertical.'],
  'news': ['Current News','Press Kit','This page can display all CEL news, announcements and public notices with filters and archive access.'],
  'eoi-rfp': ['EOI / RFP','Tenders','List current expressions of interest and requests for proposal with downloadable documents and closing dates.'],
  'archived-eoi-rfp': ['Archived EOI / RFP','Tenders','Search previous EOI and RFP notices by year, reference and category.'],
  'live-tenders': ['Live Tenders','Tenders','Display live tender notices by business vertical with reference numbers and closing dates.'],
  'archived-tenders': ['Archived Tenders','Tenders','Search and download archived tender notices and related documents.'],
  'tenders': ['Tenders','Procurement','Browse live tenders, EOI/RFP notices and archived procurement opportunities.'],
  'vendor-registration-procedure': ['Vendor Registration Procedure','Vendor','Explain eligibility, required documents and the vendor onboarding process.'],
  'vendor-registration-form': ['Vendor Registration Form','Vendor','This page is ready for a secure vendor-registration form and supporting-document upload.'],
  'vendor-application-status': ['Vendor Application Status','Vendor','Add secure application tracking using registration number and verified contact details.'],
  'approved-vendors': ['Approved Vendor List','Vendor','Publish the approved vendor list using CEL-authorised data and filters.'],
  'blacklisted-vendors': ['Blacklisted Vendors','Vendor','Publish legally approved banning and blacklisting information.'],
  'careers': ['Careers','Join CEL','Show active recruitment notices, archived advertisements, results and interview shortlists.'],
  'field-support': ['Field Support','Customer Support','Provide support contacts, service categories, escalation guidance and complaint-portal access.'],
  'about': ['About CEL','Company','Learn about CEL’s history, leadership, governance, policies and contribution to indigenous technology.']
};

const richPages = {
  'history': {
    eyebrow: 'About CEL',
    title: 'History of CEL',
    lead: 'Five Decades of Indigenous Technology, From National Laboratories to National Infrastructure',
    intro: 'Central Electronics Limited was incorporated in June 1974 with a clear mandate: take promising technologies developed inside India\'s national laboratories and R&D institutions and turn them into products the country could actually manufacture and use. Structured as a Government of India enterprise under the Department of Scientific & Industrial Research (DSIR), Ministry of Science & Technology, CEL has spent the decades since building out that mandate into a working, self-reliant industrial base.',
    sections: [
      {h:'Early Years', sub:'From Laboratory Concepts to Factory Floor', body:'CEL\'s founding brief set it apart from many public-sector enterprises of its era: rather than manufacturing an existing foreign design under licence, it was created specifically to commercialise homegrown R&D. This meant working directly alongside national laboratories and defence research establishments to move technologies out of the lab and into repeatable, standards-compliant production.'},
      {h:'Building the Solar Photovoltaic Base', sub:null, body:'CEL became one of the earliest movers in India\'s solar photovoltaic industry, developing crystalline-silicon cell and module manufacturing capability in-house at a time when the technology was still nascent domestically. That early investment became the foundation the company\'s current renewable-energy business is still built on today.'},
      {h:'Expanding Into Railways and Strategic Electronics', sub:null, body:'Alongside solar, CEL built out capability in railway signalling safety electronics — including axle-counter systems now used across the Indian rail network — and in strategic and defence-related electronics developed in close coordination with defence laboratories, reflecting the same lab-to-industry mandate the company was founded on.'},
      {h:'A Government Enterprise, Evolving', sub:null, body:'Over five decades, CEL\'s administrative home, product lines and manufacturing scale have all evolved, but its founding purpose has stayed constant — converting indigenous research into dependable, standards-certified Indian-made technology for government, industry and citizens.'}
    ],
    why:{h:'Why CEL\'s History Matters', sub:'A Track Record Built on Indigenous R&D', items:['Founded in 1974 specifically to commercialise Indian R&D','Government of India enterprise under DSIR, Ministry of Science & Technology','Early mover in Indian solar photovoltaic manufacturing','Decades of supply into Indian Railways\' safety electronics','Sustained collaboration with national and defence laboratories']},
    vision:{h:'Our Vision', body:'To remain a living link between India\'s research institutions and its industrial base — carrying that same founding purpose forward into new technologies as the country\'s needs evolve.'},
    roadmap:{h:'Future Roadmap', body:'CEL continues to expand manufacturing scale in solar, deepen its railway-safety and strategic-electronics product lines, and keep close working ties with national laboratories so new indigenous research keeps finding its way into production.'},
    contact:'Contact CEL: info@celindia.co.in'
  },
  'vision-mission': {
    eyebrow: 'About CEL',
    title: 'Vision & Mission',
    lead: 'Indigenous Technology, Delivered at National Scale',
    intro: 'CEL\'s vision and mission trace directly back to the mandate it was founded on in 1974: take technologies developed inside India\'s research institutions and turn them into dependable, standards-certified products manufactured on Indian soil.',
    sections: [
      {h:'Our Vision', sub:null, body:'To be a trusted, self-reliant Indian technology enterprise — recognised for converting indigenous research into reliable, high-quality solutions across renewable energy, railway safety and strategic electronics, in service of the country\'s national development and self-reliance goals.'},
      {h:'Our Mission', sub:null, body:'To achieve excellence in technology and production by:', list:['Commercialising indigenous R&D from national laboratories and defence research institutions','Manufacturing to international quality and certification standards','Delivering end-to-end project support, not just components, to government and institutional customers','Sustaining strong R&D partnerships so new indigenous technology keeps reaching production','Operating as a financially sound, professionally managed public-sector enterprise']},
      {h:'Core Values', sub:null, body:'These commitments guide day-to-day decisions across CEL\'s business:', list:['Self-reliance — Atmanirbhar Bharat as an operating principle, not a slogan','Quality — certification to recognised international and national standards','Integrity — transparent, accountable public-sector governance','Partnership — close collaboration with laboratories, ministries and customers','Continuous improvement — upgrading products and processes as technology advances']}
    ],
    why:{h:'Why This Vision Guides CEL', sub:'Purpose Set at Founding, Carried Forward Today', items:['Direct continuity with CEL\'s founding 1974 mandate','Vision anchored in India\'s self-reliance (Atmanirbhar Bharat) goals','Mission spans R&D commercialisation through to project delivery','Values reflect public-sector accountability and technical rigour']},
    vision:{h:'Looking Ahead', body:'As India\'s energy, rail-safety and strategic-electronics needs grow, CEL intends to keep translating that founding mandate into the next generation of indigenous products and capacity.'},
    roadmap:{h:'Future Roadmap', body:'CEL is working to scale its solar manufacturing base, deepen railway and strategic-electronics R&D partnerships, and keep strengthening the pipeline that turns laboratory research into deployed, certified products.'},
    contact:'Contact CEL: info@celindia.co.in'
  },
  'live-tenders': {
    eyebrow: 'Tenders',
    title: 'Live Tenders',
    lead: 'Current Procurement Opportunities With CEL',
    intro: 'CEL publishes its live tenders, EOIs and RFPs through the Government of India\'s Central Public Procurement Portal (CPPP) as well as this site. Below is a sample of the kind of live opportunities typically listed — always verify closing dates and full tender documents on the CPPP before submitting a bid.',
    sections: [
      {h:'Sample Live Tenders', sub:'Illustrative Listing — Verify on CPPP Before Bidding', body:'A representative snapshot of current tender activity across CEL\'s business verticals:', list:['CEL/RE/2026/041 — Supply and installation of solar PV systems · Closes 12 Aug 2026','CEL/RT/2026/017 — Railway signalling equipment procurement · Closes 19 Aug 2026','CEL/DS/2026/008 — Strategic electronics component sourcing · Closes 02 Sep 2026','CEL/DI/2026/012 — IT infrastructure and networking equipment · Closes 09 Sep 2026'], tail:'Reference numbers, titles and dates here are illustrative placeholders for this prototype — replace with the live feed from CEL\'s actual e-procurement system before this page goes public.'},
      {h:'How to Bid', sub:null, body:'Interested and eligible vendors should download the full tender document from CPPP, follow the submission instructions exactly as specified (including any e-tendering portal requirements), and ensure all eligibility criteria and required certifications are met before the closing date.'},
      {h:'Vendor Registration First', sub:null, body:'If you are not yet a registered CEL vendor, complete vendor registration before bidding — some tenders are restricted to empanelled vendors within the relevant manufacture category.'}
    ],
    why:{h:'Why Bid With CEL', sub:'Transparent, Standards-Based Public Procurement', items:['Government of India tendering process via CPPP','Opportunities across solar, railway, strategic and digital verticals','Clear eligibility and certification requirements published upfront','Established vendor base across all major manufacture categories']},
    vision:{h:'Our Vision', body:'To run a transparent, standards-based procurement process that gives capable Indian vendors fair access to CEL\'s project pipeline.'},
    roadmap:{h:'Future Roadmap', body:'CEL intends to keep expanding tender volume in step with its manufacturing and project-delivery growth, particularly across solar and railway-safety systems.'},
    contact:'Procurement queries: tenders@celindia.co.in'
  },
  'vendor-registration-form': {
    eyebrow: 'Vendor',
    title: 'Vendor Registration',
    lead: 'Register as a CEL Vendor / Seller',
    intro: 'Vendor registration on this portal is handled through the same secure account system used for the complaint and query portal — there is no separate paper form. Once registered and email-verified, your vendor account lets you receive complaints assigned to you by CEL admin staff and track them through to resolution.',
    sections: [
      {h:'Eligibility', sub:null, body:'You should register as a Vendor/Seller if you supply goods or services to CEL under one of its manufacture categories:', list:['Defence & Strategic Systems','Industrial Electronics & IT','Railway Technologies','Renewable Energy']},
      {h:'What You\'ll Need', sub:'Have These Ready Before You Start', body:'The registration form asks for:', list:['Your full name and a valid email address you can access (used for OTP verification)','A password (minimum 8 characters, with uppercase, lowercase and a number)','The manufacture category you supply under','Your registered CEL Seller/Vendor ID, if one has already been issued to you']},
      {h:'What Happens Next', sub:null, body:'After submitting the form, a one-time verification code is sent to your email. Enter it to activate your account. Once verified, CEL admin staff can assign Product Issue complaints in your category directly to your vendor queue, where you can review details, communicate with the consumer via comments, and mark issues resolved.'}
    ],
    why:{h:'Why Register as a Vendor', sub:'Direct Visibility Into Complaints Assigned to You', items:['Secure, OTP-verified account, no paperwork or waiting for approval','Complaints routed to you automatically by category','Built-in comment thread to resolve issues with the consumer directly','Full status history for every complaint you\'re assigned']},
    vision:{h:'Our Vision', body:'To make vendor onboarding fast enough that resolving a customer\'s issue is never held up by administrative delay.'},
    roadmap:{h:'Future Roadmap', body:'CEL plans to extend this portal with document upload for formal empanelment records and a self-service view of your registration and category history.'},
    contact:'Vendor support: vendors@celindia.co.in',
    cta:{label:'Start Vendor Registration', mode:'register'}
  },
  'contact': {
    eyebrow: 'Connect',
    title: 'Contact CEL',
    lead: 'Reach the Right Team, Faster',
    intro: 'CEL\'s registered office and main manufacturing facility are located in Sahibabad, Ghaziabad, Uttar Pradesh. For most consumer and vendor queries, the fastest route is the Complaint / Query Portal on this site — it routes your query straight to the right team and gives you a trackable reference number.',
    sections: [
      {h:'Registered Office', sub:null, body:'Central Electronics Limited, Site 4, Industrial Area, Sahibabad, Ghaziabad, Uttar Pradesh, India.'},
      {h:'General & Business Enquiries', sub:null, body:'For business, tender and partnership enquiries:', list:['General enquiries — info@celindia.co.in','Business & renewable-energy team — spv@celindia.co.in','Procurement / tenders — tenders@celindia.co.in','Vendor support — vendors@celindia.co.in']},
      {h:'Complaints & Support', sub:null, body:'Consumers and vendors with a specific complaint, product issue or account query should use the Complaint / Query Portal rather than general email — it creates a tracked complaint code, routes your issue to the right internal team automatically, and lets you follow its status until it\'s resolved.'}
    ],
    why:{h:'Getting a Faster Response', sub:'Use the Right Channel for Your Query', items:['Complaint Portal for anything with a tracked outcome (fastest, recommended)','Category-specific email addresses for general and business enquiries','Registered office address for formal correspondence']},
    vision:{h:'Our Commitment', body:'To make every channel — portal, email or post — lead to the right team without a citizen or vendor having to guess where to send their query.'},
    roadmap:{h:'Future Roadmap', body:'CEL plans to extend the portal with live chat support and SLA-based response tracking for registered complaints.'},
    contact:'Registered Office: Sahibabad, Ghaziabad, Uttar Pradesh, India'
  },
  'renewable-energy': {
    eyebrow: 'Strategic Business Vertical',
    title: 'Renewable Energy Solutions',
    lead: 'Powering India\'s Sustainable Future',
    intro: 'CEL, a Mini Ratna CPSE under the Department of Scientific & Industrial Research (DSIR), Ministry of Science & Technology, has spent over five decades pioneering photovoltaic technology, and continues to play a leading role in building out India\'s renewable-energy ecosystem. CEL is now evolving into a fully integrated renewable-energy company, pairing its indigenous manufacturing base with new business models, strategic partnerships and end-to-end project delivery. A 200 MWp solar PV module manufacturing facility has already been commissioned under an asset-light strategic partnership model, letting CEL scale up quickly while keeping operations efficient and infrastructure well utilised.',
    sections: [
      {h:'Solar PV Manufacturing', sub:'Building India\'s Next-Generation Solar Manufacturing Ecosystem', body:'The facility turns out ALMM-compliant, BIS-certified solar PV modules for government programmes, utility-scale projects, other public-sector enterprises and commercial buyers alike. CEL has also charted a roadmap to grow this manufacturing base to 1.2 GW, reinforcing India\'s domestic solar manufacturing strength in line with the Atmanirbhar Bharat vision.'},
      {h:'Solar EPC Solutions', sub:'Delivering Complete Renewable-Energy Projects', body:'CEL is re-establishing itself as a trusted Engineering, Procurement & Construction (EPC) partner for solar power projects nationwide, drawing on its technical know-how, government credentials and manufacturing base to offer turnkey solutions across:', list:['Utility-scale solar power plants','Ground-mounted solar projects','Rooftop solar systems','Off-grid & hybrid solar installations','Government & institutional projects','Industrial & commercial solar solutions'], tail:'CEL supports every stage from conceptualisation through commissioning and ongoing lifecycle support.'},
      {h:'Strategic Partnerships', sub:'Collaborating for a Greener Tomorrow', body:'CEL works closely with central ministries, state governments, other CPSEs, utilities, development agencies and industry partners to speed up renewable-energy deployment across the country, building scalable clean-energy solutions through collaborative business models and strategic alliances.'},
      {h:'Integrated Project Delivery', sub:null, body:'CEL supports the full project lifecycle, covering:', list:['Project conceptualisation','Feasibility studies & DPR preparation','Engineering & system design','Procurement & supply-chain management','Project execution & commissioning','Operation & maintenance services','Remote monitoring & performance optimisation','Asset lifecycle management']}
    ],
    why:{h:'Why Partner with CEL?', sub:'Government Trust. Engineering Excellence. Sustainable Growth.', items:['Mini Ratna CPSE under the Government of India','Over 50 years of photovoltaic technology leadership','200 MWp advanced solar PV manufacturing facility','Expansion roadmap towards 1.2 GW manufacturing capacity','ALMM-compliant & BIS-certified solar modules','End-to-end EPC solutions','Trusted partner for government & public-sector projects','Innovative asset-light manufacturing model','Strong engineering & project-management expertise','Commitment to quality, sustainability & innovation']},
    vision:{h:'Our Vision', body:'To become one of India\'s leading integrated renewable-energy companies by building world-class manufacturing capabilities, delivering innovative clean-energy solutions and creating sustainable value for customers, partners and the nation.'},
    roadmap:{h:'Future Roadmap', body:'CEL plans to grow its renewable-energy footprint further by strengthening domestic manufacturing, sharpening project-execution capability and adopting emerging clean-energy technologies. With a clear path towards 1.2 GW of manufacturing capacity, strategic collaborations and customer-first solutions, CEL aims to meaningfully support India\'s energy transition and the national goals of Net Zero, Atmanirbhar Bharat and Viksit Bharat.'},
    contact:'Contact the Business Team: spv@celindia.co.in'
  },
  'pv-cells-panels': {
    eyebrow:'Solar Products',
    title:'PV Cells & Panels',
    lead:'Indigenous Crystalline Silicon Solar Cells & Modules',
    intro:'CEL was the country\'s pioneer in solar photovoltaic manufacturing and remains among the world\'s established producers of crystalline-silicon solar cells. Its integrated production line converts silicon wafers into finished cells and modules using in-house screen-printing technology, and the company has supplied well over five lakh SPV systems across rural and industrial applications in India and abroad.',
    sections:[
      {h:'Cell Manufacturing', sub:'Crystalline Silicon Solar Cells', body:'CEL manufactures multi-crystalline and mono-crystalline silicon solar cells at its Sahibabad facility. Cells are produced with multiple busbar configurations and consistently meet the peak-power ratings demanded by government and utility tenders, with conversion efficiencies benchmarked against current national standards.'},
      {h:'Module Manufacturing', sub:'High-Performance PV Modules', body:'Modules are built up from these cells using UV-stabilised EVA encapsulation and a Tedlar-Polyester-Tedlar back sheet, finished with toughened glass and an anodised aluminium frame. This construction is engineered to hold up under the temperature extremes and weather conditions found from high-altitude terrain to deserts and coastal belts.'},
      {h:'Standards & Certification', sub:null, body:'CEL modules are qualified to IEC 61215 and IEC 61730, tested by TUV Rheinland, and independently verified by the National Institute of Solar Energy (NISE) under the Ministry of New and Renewable Energy. Current production is also being scaled to meet ALMM listing requirements for government-funded projects.'},
      {h:'Applications', sub:null, body:'CEL cells and panels feed into the company\'s own downstream product lines as well as third-party integrators, and are used across:', list:['Utility-scale and rooftop solar plants','Home and street lighting systems','Solar water pumping systems','Off-grid and mini-grid installations','Defence and strategic equipment power supplies']}
    ],
    why:{h:'Why CEL PV Cells & Panels', sub:'Five Decades of Indigenous Photovoltaic Expertise', items:['Pioneer of solar photovoltaic manufacturing in India','Integrated cell-to-module production at Sahibabad','200 MWp manufacturing facility with a roadmap to 1.2 GW','IEC 61215/61730 certified, TUV Rheinland tested','Independently verified by NISE, MNRE','Track record of 5+ lakh SPV systems supplied','Trusted supplier for government and defence programmes']},
    vision:{h:'Our Vision', body:'To remain India\'s benchmark indigenous manufacturer of solar cells and modules, scaling capacity and efficiency while supporting the country\'s domestic-manufacturing and energy-security goals.'},
    roadmap:{h:'Future Roadmap', body:'CEL is expanding its module manufacturing base toward 1.2 GW, upgrading cell efficiency and busbar technology, and deepening component supply to its own EPC, lighting and water-pumping business lines.'},
    contact:'Contact the Business Team: spv@celindia.co.in'
  },
  'solar-power-plants': {
    eyebrow:'Solar Products',
    title:'Solar Power Plants',
    lead:'Rooftop, Ground-Mounted, BIPV & Retrofitted Power Plants',
    intro:'CEL delivers a complete portfolio of solar power plants, from a few kilowatts to multi-megawatt installations, built on a goal of sustainable, clean and carbon-free power supply. The company has commissioned projects across on-grid and off-grid configurations for government departments, public-sector units, railways and institutional customers.',
    sections:[
      {h:'Plant Formats', sub:'A Solution for Every Site', body:'CEL\'s power-plant portfolio spans four principal formats:', list:['Off-grid and on-grid rooftop power plants','Ground-mounted utility-scale power plants','Building-Integrated Photovoltaic (BIPV) power plants','Retrofitted power plants on existing structures']},
      {h:'BIPV Deployment', sub:'India\'s First BIPV Railway Platform', body:'In partnership with Indian Railways, CEL commissioned the country\'s first Building-Integrated Photovoltaic solar power platform at Sahibabad Railway Station, replacing the platform\'s old asbestos-sheet roofing with a waterproof roof made entirely of solar PV modules — generating power while doubling as weatherproof platform cover.'},
      {h:'Project Delivery', sub:null, body:'Each plant is supported end-to-end, covering site assessment, engineering and design, supply of CEL-manufactured modules, installation, commissioning, and after-commissioning operations and maintenance support.'}
    ],
    why:{h:'Why CEL Solar Power Plants', sub:'Proven Delivery, Government-Grade Reliability', items:['Portfolio spanning kilowatt to megawatt scale','Rooftop, ground-mounted, BIPV and retrofit formats','India\'s first BIPV railway-platform installation','In-house manufactured, certified PV modules','End-to-end EPC and O&M support','Government and public-sector project experience']},
    vision:{h:'Our Vision', body:'To be the preferred public-sector partner for solar power-plant deployment across government, railway and institutional sites nationwide.'},
    roadmap:{h:'Future Roadmap', body:'CEL is extending BIPV deployment to additional railway and public infrastructure sites while scaling ground-mounted and rooftop capacity in step with its expanding module-manufacturing base.'},
    contact:'Contact the Business Team: spv@celindia.co.in'
  },
  'bipv-bess': {
    eyebrow:'Solar Products',
    title:'BIPV & Battery Energy Storage',
    lead:'Solar Integrated into Structures, Power Available After Sunset',
    intro:'CEL pairs Building-Integrated Photovoltaics with Battery Energy Storage Systems so that solar generation can be built directly into a structure\'s roof or facade and the energy produced can be stored and dispatched even outside daylight hours.',
    sections:[
      {h:'Building-Integrated Photovoltaics', sub:'Solar as Structure, Not an Add-On', body:'Rather than mounting panels on top of an existing roof, CEL\'s BIPV systems replace conventional roofing or facade material with solar PV modules themselves. The Sahibabad Railway Station platform roof is a working example — asbestos sheeting was replaced by a waterproof PV-module roof that shelters passengers and generates power at the same time.'},
      {h:'Battery Energy Storage Systems', sub:null, body:'BESS integration lets CEL installations store daytime solar generation for evening and night-time use, improving reliability for critical and off-grid sites and helping installations ride through grid outages.'},
      {h:'Applications', sub:null, body:'BIPV & BESS solutions suit railway infrastructure, institutional buildings, industrial sheds and any site where roof or facade area can be put to dual use as both structure and power source.'}
    ],
    why:{h:'Why CEL BIPV & BESS', sub:'Dual-Purpose Infrastructure', items:['Demonstrated BIPV deployment on live railway infrastructure','In-house PV module manufacturing feeding BIPV builds','Storage-backed designs for round-the-clock reliability','Engineering support from structural integration through commissioning']},
    vision:{h:'Our Vision', body:'To make solar generation a structural default for new and retrofitted public infrastructure, not an afterthought bolted on top of it.'},
    roadmap:{h:'Future Roadmap', body:'CEL plans to extend BIPV installations to further railway platforms and public buildings, paired with growing battery-storage capacity to widen round-the-clock power availability.'},
    contact:'Contact the Business Team: spv@celindia.co.in'
  },
  'solar-water-pumping': {
    eyebrow:'Solar Products',
    title:'Solar Water Pumping',
    lead:'Off-Grid Irrigation & Household Water Supply Powered by the Sun',
    intro:'CEL\'s solar water pumping systems are self-contained power houses: a solar array sized and tuned to match the equivalent power draw of the pump for a given application, replacing diesel or grid-dependent pumping in areas where electricity is unavailable, unreliable or costly.',
    sections:[
      {h:'System Design', sub:'Matched Array & Pump Sizing', body:'Each installation pairs a solar array with a pump capacity suited to the site\'s irrigation or household water needs, so the system runs directly off sunlight without a diesel generator or grid connection.'},
      {h:'Applications', sub:null, body:'CEL\'s systems are used for:', list:['Agricultural irrigation, including drip-irrigation integration','Household and community drinking-water supply','Remote and off-grid locations without reliable grid power']},
      {h:'Field Deployment', sub:null, body:'CEL has supplied standalone and off-grid solar water pumping systems under state government programmes, with installation and commissioning handled by CEL-empanelled installers.'}
    ],
    why:{h:'Why CEL Solar Water Pumping', sub:'Reliable Power Where the Grid Doesn\'t Reach', items:['Sized to match pump load precisely, no oversizing waste','Works with existing drip-irrigation infrastructure','No fuel cost, low maintenance versus diesel pumps','Government-tender and state-programme experience']},
    vision:{h:'Our Vision', body:'To extend dependable, sunlight-powered irrigation and water access to every farm and community currently outside reliable grid reach.'},
    roadmap:{h:'Future Roadmap', body:'CEL continues to participate in state and central solar-pumping programmes, expanding empanelled-installer coverage and pump-capacity options.'},
    contact:'Contact the Business Team: spv@celindia.co.in'
  },
  'lighting-mini-grids': {
    eyebrow:'Solar Products',
    title:'Lighting & Mini Grids',
    lead:'Home, Street & Community Lighting — and Smart Mini Grids for Unelectrified Areas',
    intro:'CEL\'s lighting and mini-grid range covers everything from a single home lighting unit to a full smart mini-grid capable of electrifying an entire unconnected community, all built around CEL\'s own solar cells and modules.',
    sections:[
      {h:'Solar Home Lighting', sub:null, body:'A compact, independent power solution for remote homes where grid electricity is unavailable, unreliable or expensive, capable of running lights along with small appliances such as fans, televisions and mobile-phone charging.'},
      {h:'Solar Street Lighting', sub:null, body:'Standalone and centralised solar street-lighting systems have been installed across rural and urban locations nationwide, providing community lighting without drawing on the grid.'},
      {h:'Smart Mini Grids', sub:'Electrifying the Unconnected', body:'CEL\'s Smart Mini Grids range from 1 kW to 100 kW capacity and include features such as pre-paid/smart metering and over-draw disconnection. A single mini grid can power community lighting, home lighting and water-pumping loads together, effectively bringing full electrification to areas the grid does not reach.'}
    ],
    why:{h:'Why CEL Lighting & Mini Grids', sub:'From a Single Home to an Entire Village', items:['Full range from home lighting to 100 kW mini grids','Smart/pre-paid metering built into mini-grid systems','Nationwide rural and urban street-lighting deployment','Built on CEL\'s own certified solar cells and modules']},
    vision:{h:'Our Vision', body:'To bring reliable, smart-metered solar power to every home, street and settlement still waiting for grid electrification.'},
    roadmap:{h:'Future Roadmap', body:'CEL is expanding mini-grid deployment in unelectrified and under-served regions, with continued focus on smart-metering features and integration with home lighting and water-pumping loads.'},
    contact:'Contact the Business Team: spv@celindia.co.in'
  }
};

function renderRichPage(slug){
  const p=richPages[slug];
  const sectionsHtml=p.sections.map(s=>`<div class="content-section"><h3>${s.h}</h3>${s.sub?`<p class="section-sub">${s.sub}</p>`:''}<p>${s.body}</p>${s.list?`<ul class="check-list">${s.list.map(i=>`<li>${i}</li>`).join('')}</ul>`:''}${s.tail?`<p>${s.tail}</p>`:''}</div>`).join('');
  const whyHtml=`<div class="content-section"><h3>${p.why.h}</h3><p class="section-sub">${p.why.sub}</p><ul class="tick-list">${p.why.items.map(i=>`<li>✔ ${i}</li>`).join('')}</ul></div>`;
  const ctaHtml=p.cta?`<button class="content-action" data-cta="${p.cta.mode}">${p.cta.label} →</button>`:'';
  portal.innerHTML=`<div class="content-page"><div class="container"><nav class="breadcrumbs"><a href="#home" id="contentHome">Home</a><span>›</span><span>${p.eyebrow}</span><span>›</span><strong>${p.title}</strong></nav><div class="content-hero"><span class="eyebrow">${p.eyebrow}</span><h1>${p.title}</h1><p>${p.lead}</p></div><div class="content-grid"><article class="portal-card"><p>${p.intro}</p>${sectionsHtml}${whyHtml}<div class="content-section"><h3>${p.vision.h}</h3><p>${p.vision.body}</p></div><div class="content-section"><h3>${p.roadmap.h}</h3><p>${p.roadmap.body}</p></div><div class="placeholder-panel"><strong>${p.contact}</strong></div></article><aside class="portal-card"><h3>Related actions</h3><a class="content-action" href="#home" id="contentBack">← Return to homepage</a>${ctaHtml}<button class="content-action" data-route="complaints">Register Complaint / Query →</button></aside></div></div></div>`;
  window.scrollTo({top:0,behavior:'smooth'});
  document.getElementById('contentHome').onclick=closePortal;
  document.getElementById('contentBack').onclick=closePortal;
  portal.querySelectorAll('[data-route="complaints"]').forEach(el=>el.onclick=e=>{e.preventDefault();openPortal();});
  portal.querySelectorAll('[data-cta]').forEach(el=>el.onclick=e=>{
    e.preventDefault();
    openPortal();
    if(el.dataset.cta==='register' && !state.user) renderAuth('register');
  });
}

// Renders the Approved Vendor List from live account data (GET /api/public/vendors)
// instead of static placeholder text — grouped by manufacture category.
async function renderApprovedVendorsPage(){
  publicSite.classList.add('hidden');
  portal.classList.remove('hidden');
  window.scrollTo({top:0,behavior:'smooth'});
  portal.innerHTML=`<div class="content-page"><div class="container"><nav class="breadcrumbs"><a href="#home" id="contentHome">Home</a><span>›</span><span>Vendor</span><span>›</span><strong>Approved Vendor List</strong></nav><div class="content-hero"><span class="eyebrow">Vendor</span><h1>Approved Vendor List</h1><p>Vendors currently registered and verified on the CEL portal, grouped by manufacture category.</p></div><div class="content-grid"><article class="portal-card" id="vendorListArea"><p>Loading vendor list…</p></article><aside class="portal-card"><h3>Related actions</h3><a class="content-action" href="#home" id="contentBack">← Return to homepage</a><button class="content-action" data-cta="register">Register as a Vendor →</button><button class="content-action" data-route="complaints">Register Complaint / Query →</button></aside></div></div></div>`;
  document.getElementById('contentHome').onclick=closePortal;
  document.getElementById('contentBack').onclick=closePortal;
  portal.querySelectorAll('[data-route="complaints"]').forEach(el=>el.onclick=e=>{e.preventDefault();openPortal();});
  portal.querySelectorAll('[data-cta]').forEach(el=>el.onclick=e=>{e.preventDefault();openPortal();if(!state.user) renderAuth('register');});
  const area=document.getElementById('vendorListArea');
  try{
    const data=await api('/api/public/vendors');
    if(!data.vendors.length){ area.innerHTML='<p>No approved vendors are registered yet.</p>'; return; }
    const grouped={};
    data.vendors.forEach(v=>{ (grouped[v.category]=grouped[v.category]||[]).push(v); });
    area.innerHTML=Object.entries(grouped).map(([cat,list])=>`<div class="content-section"><h3>${cat}</h3><ul class="check-list">${list.map(v=>`<li>${v.name} — <strong>${v.vendor_id||'No vendor ID on file'}</strong></li>`).join('')}</ul></div>`).join('');
  }catch(err){
    area.innerHTML=`<p>Could not load the vendor list right now. Please try again shortly.</p>`;
  }
}

function showContentPage(slug){
  publicSite.classList.add('hidden');
  portal.classList.remove('hidden');
  if(slug==='approved-vendors') return renderApprovedVendorsPage();
  if(richPages[slug]) return renderRichPage(slug);
  const page=contentPages[slug];
  if(!page) return;
  portal.innerHTML=`<div class="content-page"><div class="container"><nav class="breadcrumbs"><a href="#home" id="contentHome">Home</a><span>›</span><span>${page[1]}</span><span>›</span><strong>${page[0]}</strong></nav><div class="content-hero"><span class="eyebrow">${page[1]}</span><h1>${page[0]}</h1><p>${page[2]}</p></div><div class="content-grid"><article class="portal-card"><h2>${page[0]}</h2><p>${page[2]}</p><p>This is a functional internal page in the CEL clone. Replace this placeholder with CEL-approved text, images, documents, forms or tables.</p><div class="placeholder-panel"><strong>Content area ready</strong><span>Official CEL content can be added here without changing the navigation.</span></div></article><aside class="portal-card"><h3>Related actions</h3><a class="content-action" href="#home" id="contentBack">← Return to homepage</a><button class="content-action" data-route="complaints">Register Complaint / Query →</button></aside></div></div></div>`;
  window.scrollTo({top:0,behavior:'smooth'});
  document.getElementById('contentHome').onclick=closePortal;
  document.getElementById('contentBack').onclick=closePortal;
  portal.querySelectorAll('[data-route="complaints"]').forEach(el=>el.onclick=e=>{e.preventDefault();openPortal();});
}

function bindContentLinks(){
  document.querySelectorAll('[data-page]').forEach(a=>{
    a.addEventListener('click',e=>{e.preventDefault();showContentPage(a.dataset.page);document.getElementById('mainNav').classList.remove('open');});
  });
}

document.querySelectorAll('[data-route="complaints"]').forEach(el=>el.addEventListener('click',e=>{e.preventDefault();openPortal();}));
accountButton.addEventListener('click',openPortal);
document.getElementById('menuToggle').onclick=()=>document.getElementById('mainNav').classList.toggle('open');

// Dropdown (mega-menu) click/tap/keyboard support — previously these only opened on mouse hover,
// which meant they never opened on touch devices or via keyboard focus.
document.querySelectorAll('.nav-item').forEach(item=>{
  const btn=item.querySelector('button');
  if(!btn) return;
  btn.setAttribute('aria-expanded','false');
  btn.addEventListener('click',e=>{
    e.stopPropagation();
    const isOpen=item.classList.contains('open');
    document.querySelectorAll('.nav-item.open').forEach(o=>{o.classList.remove('open');o.querySelector('button').setAttribute('aria-expanded','false');});
    if(!isOpen){item.classList.add('open');btn.setAttribute('aria-expanded','true');}
  });
});
document.addEventListener('click',()=>{
  document.querySelectorAll('.nav-item.open').forEach(o=>{o.classList.remove('open');o.querySelector('button').setAttribute('aria-expanded','false');});
});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){
    document.querySelectorAll('.nav-item.open').forEach(o=>{o.classList.remove('open');o.querySelector('button').setAttribute('aria-expanded','false');});
  }
});
document.querySelectorAll('.main-nav a').forEach(a=>a.addEventListener('click',()=>document.getElementById('mainNav').classList.remove('open')));

document.querySelector('[data-action="increase-font"]').onclick=()=>document.documentElement.style.fontSize=`${Math.min(20,parseFloat(getComputedStyle(document.documentElement).fontSize)+1)}px`;
document.querySelector('[data-action="decrease-font"]').onclick=()=>document.documentElement.style.fontSize=`${Math.max(13,parseFloat(getComputedStyle(document.documentElement).fontSize)-1)}px`;
document.querySelector('[data-action="grayscale"]').onclick=()=>document.body.classList.toggle('grayscale');
document.querySelector('[data-action="contrast"]').onclick=()=>document.body.classList.toggle('high-contrast');
document.querySelector('[data-action="underline"]').onclick=()=>document.body.classList.toggle('underline-links');
document.querySelector('[data-action="readable"]').onclick=()=>document.body.classList.toggle('readable');
document.querySelector('[data-action="reset-accessibility"]').onclick=()=>{document.body.className='';document.documentElement.style.fontSize='16px';};
document.querySelector('[data-action="language"]').onclick=()=>toast('Hindi content architecture is ready; translations can be added in the content layer.');

bindContentLinks();
loadSession().catch(()=>{});
if(location.hash==='#complaints') openPortal();
else if(location.hash.startsWith('#page-')) showContentPage(location.hash.replace('#page-',''));
window.addEventListener('hashchange',()=>{if(location.hash.startsWith('#page-')) showContentPage(location.hash.replace('#page-',''));});
