var jq=jQuery.noConflict(true);

// --------------------------------
// Initialization functions
// --------------------------------
// Main entry point on document load
jq(function() {
  console.log('Custom settings active.');
  const $panel = jq(`
    <div id="billingsets" style="height: 180px; bottom: 210px; width: 220px;">
      <span class="headerbar">Billing Sets</span>
      <div id="apptptname" style="left:5px; top:30px; right: 5px">No appointment selected.</div>
      <div id="apptcomments" style="left:5px; top:45px; right: 5px">Enter age for checkups or L1-L5 for sick.</div>
      <input type="text" id="chargedesc" style="left:5px; top:60px; right:5px" autocomplete="off"></input>
      <button id="applycharge" class="webbutton" style="right:5px; top:60px; width:55px; height:19px;">Apply</button>
      <div style="left:5px; top:75px; right: 5px; bottom:5px">
        <ul id="chargedetails" style="padding-inline-start:15px"></ul>
      </div>
    </div>
  `);
  
  // Shrink appts list and insert custom panel
  jq('#appointmentsGridDiv').css('bottom', 395);
  $panel.insertBefore('#patientRecallDiv');

  // Select me as the provider
  inject("$('#apptProviderSelect').val('prof208').trigger('change');");

  // Install handlers
  bindShortcuts();
  bindListeners();
  bindButtons();
});
// Bind all keyboard handlers
function bindShortcuts() {
  // Global shortcuts
  jq(document).keydown(function(e) {
    if (e.keyCode === 38) { // up arrow
      prevAppt();
    } else if (e.keyCode === 40) { // down arrow
      nextAppt();
    } else if (e.keyCode === 187 && e.altKey) { // alt+=
      toggleAllCodes();
    }
  });
  // Shortcuts in Charge Description input that we added under patient list
  jq('#chargedesc').on('keyup', function(e) {
    if (e.keyCode === 13) { // enter
      processCharge();
    }
  }).on('input', function(e) {
    handleChargeInput();
  });
}
// Bind all button handlers
function bindButtons() {
  // Update appointment information when clicking on an appointment
  jq('#appointmentsTable').bind('click', 'tr', () => {
    // Defer processing until all other click handlers are complete
    setTimeout(handleSelectAppt, 1);
  });
  // 'Process Charge Slip' clicks. We have to proxy the underlying click handler because
  // the mock library calls the jQ click handler directly, rather than trigger a click event
  // when the shortcut key is used. handleProcessSlip() is called by handleMessage() once
  // we receive the appropriate message.
  inject('onlineChargeSlips.origProcessChargeSlips=onlineChargeSlips.processChargeSlips; onlineChargeSlips.processChargeSlips=function(){onlineChargeSlips.origProcessChargeSlips.apply(this,arguments); window.postMessage({type:"event",val:"processChargeSlips"},"*");}');
  // Handle our 'Apply' button
  jq('#applycharge').click(processCharge);
}
// Bind all event handlers
function bindListeners() {
  // Listen for incoming messages from the website (for example, as injected from getXml())
  window.addEventListener('message', handleMessage);
}


// ---------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------
// Select previous patient appointment when user presses up arrow
function prevAppt() {
  if (jq('#appointmentsTable tr.selectedrow').length === 0) {
    // No appointment row selected, click the last
    const $lastRow = jq('#appointmentsTable tr:last td:first');
    $lastRow.click();
    jq('#appointmentsDataDiv').scrollTop($lastRow.offset().top);
  } else {
    // A row is selected and there's a sibling row that precedes it. Click prev row.
    const $prevRow = jq('#appointmentsTable tr.selectedrow').prev('tr');
    if ($prevRow.length) {
      $prevRow.find('td:first').click();
    }
  }
}

// Select next patient appointment when user presses down arrow
function nextAppt() {
  if (jq('#appointmentsTable tr.selectedrow').length === 0) {
    // No appointment row selected, click the first one
    jq('#appointmentsTable tr:first td:first').click();
  } else {
    // A row is selected and there's a sibling row that follows (+ tr). Click next row.
    const $nextRow = jq('#appointmentsTable tr.selectedrow + tr');
    if ($nextRow.length) {
      $nextRow.find('td:first').click();
    }
  }
}

// Open or close all sections on billing sheet when user presses alt+=
function toggleAllCodes() {
  if (jq('.proccodegroupclosed').length) {
    jq('.proccodegroupclosed').click();
  } else {
    jq('.proccodegroupopen').click();
  }
}

// Handle when user selects a new appointment from the list
let lastSelectedRowIdx = -1;
function handleSelectAppt() {
  const $selectedRow = jq('#appointmentsTable tr.selectedrow');
  if ($selectedRow.length) {
    // Grab the visit ID from the table row data-visitid attribute
    const visitId = $selectedRow.attr('data-visitid');

    // Get visit information from global var on site (relies on passing message to webpage, which then returns a message processed by handleMessage())
    getXml('onlineChargeSlips.screenXml.selectNodes("//patientlist/patient/visitlist/visit[(@id=\'' + visitId + '\')]")[0]')
      .then(xml => {
        if (xml) {
          // Get demographic and appointment information from the header and returned XML
          const name = jq('#patientDiv').text();
          const comments = xml.getElementsByTagName('visit')[0].getAttribute('comments');
          const age = jq('#ageSpan') && jq('#ageSpan').text().split('/');
          const ageStr = (age[0] == 0 ? '' : age[0] + 'y ') + age[1] + 'm';
          const color = xml.getElementsByTagName('visit')[0].getAttribute('color');
          const isWcc = color.match(/ORANGE|LILAC/) || comments.match(/WCC|checkup/i);
          const isSick = color.match(/GREEN|RED|BLUE|GRAY/);
          const isNew = color.match(/TEAL|SAGE/);
          const appttype = 
            (isNew ? 'NP ' : '') +
            (isSick ? 'Sick' : 
              isWcc ? 'WCC' : '');
          let chargedesc = 
            (isNew ? 'NP ' : '') +
            (isWcc ? getWCCAge(age[0], age[1]) + ' ' : '');

          // For sick visits, try to guess diagnosis from appt comments
          if (isSick || !isWcc) {
            chargedesc = commentToChargeDesc(chargedesc, comments) + ' ';
          }

          jq('#apptptname').text(name + ' (' + ageStr + ')');
          jq('#apptcomments').text(appttype + ': ' + comments);
          jq('#chargedesc').val(chargedesc).trigger('input').focus();
        }
      });
  }
  lastSelectedRowIdx = $selectedRow.index();
}

function handleProcessSlip() {
  // Select appointment at same index as most recently selected one
  if (lastSelectedRowIdx >= 0) {
    const $rows = jq('#appointmentsTable tr');
    const rowIdx = Math.min(lastSelectedRowIdx, $rows.length-1);
    const $row = $rows.eq(rowIdx);
    $row.find('td:first').click();
  } else {
    // We don't know the index of the originally selected appt; just click the first
    jq('#appointmentsTable tr:first td:first').click();
  }
}

// Convert age in years and months to the nearest well child check age
function getWCCAge(y, m) {
  if (y == 0) {
    if (m < 1) {
      return '2w'
    } else if (m < 4) {
      return '2m'
    } else if (m < 6) {
      return '4m';
    } else if (m < 8) {
      return '6m';
    } else {
      return '9m';
    }
  } else if (y == 1) {
    if (m < 3) {
      return '12m';
    } else if (m < 6) {
      return '15m';
    } else if (m < 11) {
      return '18m';
    } else {
      return '2y';
    }
  } else {
    return y + 'y';
  }
}

function commentToChargeDesc(curDesc, comments) {
  // Use the first part of the comment as diagnosis, drop anything after '/' or ';'
  const head = comments.split(/[\/;]/, 1)[0];

  // Try our best to guess a known diagnoses from the appt comments
  const knownDx = ['aom', 'asthma', 'bee', 'bili', 'cough', 'concussion', 'constip', 'fever', 'headache', 'rash', 'vomiting', 'uti']
  if (comments.match(/^cir/i)) {
    return 'circ';
  } else if (head.match(/nb|1 week/i)) {
    return 'nb';
  } else {
    // test for dxs that are word for word equivalent to our keywords, e.g. cough and fever
    for (let i=0; i<knownDx.length; i++) {
      if (comments.match(new RegExp(knownDx[i], 'i'))) {
        return curDesc + knownDx[i];
      }
    }
  }

  // otherwise, return current description as is
  return curDesc;
}

function getCharges(chargeStr) {
  // Partition keywords from rest of text
  const wccRegex = /^nb|2w|(2|4|6|9|12|15|18|24)m|[1-3]?[0-9]y$/;
  const { keywords, rest } = extractKeywords(chargeStr, [
    // New patient
    'np',
    // WCCs, e.g. 2m and 17y
    wccRegex, 
    // sick visits, L1 to L5
    /l[1-5]/,               
    // specific imms                     
    'dtap', 'dtap/ipv', 'dtap/ipv/hepb', 'flu', 'gardasil', 'hepa', 'hepb', 'hib', 'hpv', 'kinrix', 'mcv', 'menactra', 'menacwy', 'mmr', 'mmrv', 'pcv', 'pediarix', 'proquad', 'rota', 'tdap', 'varicella', 'vzv',
    // procedures
    'circ', 'cerumen', 'ctx', 'dental', 'denver', 'dex', 'mchat', 'neb', 'audio', 'hearing', 'preg', 'rss', 'strep', 'vision', 'wax',
  ]);


  // Demographics from header
  const age = jq('#ageSpan') && jq('#ageSpan').text().split('/');
  const ageYrs = parseInt(age[0]) + parseInt(age[1])/12;
  const dob = dayjs(jq('#dobDiv span').text());
  const insurance = jq('#primaryInsuranceDiv span').text();

  // Appointment characteristics
  const isNew = keywords.some(k => k == 'np')
  const isWcc = keywords.some(k => k.match(wccRegex));
  const isHmso = insurance.match(/apple|hmso|medicaid/i);
  const thisMonth = new Date().getMonth();
  const isFluSeason = thisMonth >= 9 || thisMonth <=2;

  // Convert keywords to icd codes
  let icds = [];
  let recall = null;
  keywords.forEach(keyword => {
    // Handle WCCs
    if (keyword == 'nb') {
      // NB WCC - always new patient
      icds.unshift('99381', 'Z00.110');
      recall = { type: 'ap_type62', n: 10, unit: 'DAYS' };
    } else if (keyword == '2w') {
      icds.unshift(isNew ? '99381' : '99391', 'Z00.111');
      recall = { type: 'ap_type63', n: 6, unit: 'WEEKS' };
    } else if (keyword == '2m') {
      icds.unshift(isNew ? '99381' : '99391', 'Z00.129');
      icds.push('90723', '90647', '90670', '90680');
      recall = { type: 'ap_type64', n: 2, unit: 'MONTHS' };
    } else if (keyword == '4m') {
      icds.unshift(isNew ? '99381' : '99391', 'Z00.129');
      icds.push('90723', '90647', '90670', '90680');
      recall = { type: 'ap_type65', n: 2, unit: 'MONTHS' };
    } else if (keyword == '6m') {
      icds.unshift(isNew ? '99381' : '99391', 'Z00.129');
      icds.push('90723', '90670', '90680');
      icds.push(isHmso ? ['D0120', 'D9999'] : []); // Oral eval for Medicaid pts
      recall = { type: 'ap_type66', n: 3, unit: 'MONTHS' };
    } else if (keyword == '9m') {
      icds.unshift(isNew ? '99381' : '99391', 'Z00.129');
      icds.push('96110');
      icds.push(isHmso ? ['D0120', 'D9999'] : []);
      recall = { type: 'ap_type67', n: 3, unit: 'MONTHS' };
    } else if (keyword == '12m' || keyword == '1y') {
      icds.unshift(isNew ? '99382' : '99392', 'Z00.129');
      icds.push('90633', '90670', '90707');
      icds.push(isHmso ? ['D0120', 'D9999'] : []); // Oral eval
      recall = { type: 'ap_type68', n: 3, unit: 'MONTHS' };
    } else if (keyword == '15m') {
      icds.unshift(isNew ? '99382' : '99392', 'Z00.129');
      icds.push('90647', '90716');
      icds.push(isHmso ? ['D0120', 'D9999'] : []); // Oral eval
      recall = { type: 'ap_type69', n: 3, unit: 'MONTHS' };
    } else if (keyword == '18m') {
      icds.unshift(isNew ? '99382' : '99392', 'Z00.129');
      icds.push('90700', '90633');
      icds.push('96110');
      icds.push(isHmso ? ['D0120', 'D9999'] : []); // Oral eval
      recall = { type: 'ap_type70', n: 6, unit: 'MONTHS' };
    } else if (keyword == '24m' || keyword == '2y') {
      icds.unshift(isNew ? '99382' : '99392', 'Z00.129');
      icds.push(isHmso ? ['D0120', 'D9999'] : []); // Oral eval
      recall = { type: 'ap_type71', n: 12, unit: 'MONTHS' };
    } else if (keyword == '3y') {
      icds.unshift(isNew ? '99382' : '99392', 'Z00.129');
      icds.push('99173'); // vision screen
      icds.push(isHmso ? ['D0120', 'D9999'] : []); // Oral eval
      recall = { type: 'ap_type71', n: 12, unit: 'MONTHS' };
    } else if (keyword == '4y') {
      icds.unshift(isNew ? '99382' : '99392', 'Z00.129');
      icds.push('90696', '90710');
      icds.push('99173');
      icds.push(isHmso ? ['D0120', 'D9999'] : []); // Oral eval
      recall = { type: 'ap_type71', n: 12, unit: 'MONTHS' };
    } else if (keyword == '5y') {
      icds.unshift(isNew ? '99383' : '99393', 'Z00.129');
      icds.push('92552'); // hearing screen
      icds.push('99173');
      recall = { type: 'ap_type71', n: 12, unit: 'MONTHS' };
    } else if (keyword.match(/^([6-9]|10)y/)) {
      icds.unshift(isNew ? '99383' : '99393', 'Z00.129');
      icds.push('99173');
      recall = { type: 'ap_type71', n: 12, unit: 'MONTHS' };
    } else if (keyword.match(/11y/)) {
      icds.unshift(isNew ? '99383' : '99393', 'Z00.129');
      icds.push('90715', '90734', '90651');
      icds.push('99173');
      recall = { type: 'ap_type71', n: 12, unit: 'MONTHS' };
    } else if (keyword.match(/12y/)) {
      icds.unshift(isNew ? '99384' : '99394', 'Z00.129');
      icds.push('90651');
      icds.push('96127');
      icds.push('99173');
      recall = { type: 'ap_type71', n: 12, unit: 'MONTHS' };
    } else if (keyword.match(/(13|14|15|17)y/)) {
      icds.unshift(isNew ? '99384' : '99394', 'Z00.129');
      icds.push('96127');
      icds.push('99173');
      recall = { type: 'ap_type71', n: 12, unit: 'MONTHS' };
    } else if (keyword.match(/16y/)) {
      icds.unshift(isNew ? '99384' : '99394', 'Z00.129');
      icds.push('90734');
      icds.push('96127');
      icds.push('99173');
      recall = { type: 'ap_type71', n: 12, unit: 'MONTHS' };
    } else if (keyword.match(/(18|19|[2-3][0-9])y/)) {
      icds.unshift(isNew ? '99385' : '99395', 'Z00.129');
      icds.push('96127');
      icds.push('99173');
      recall = { type: 'ap_type71', n: 12, unit: 'MONTHS' };
    }

    // Handle dx codes for sick visits
    if (keyword == 'l1') {
      icds.unshift(isNew ? '99201' : '99211');
    } else if (keyword == 'l2') {
      icds.unshift(isNew ? '99202' : '99212');
    } else if (keyword == 'l3') {
      icds.unshift(isNew ? '99203' : '99213');
    } else if (keyword == 'l4') {
      icds.unshift(isNew ? '99204' : '99214');
    } else if (keyword == 'l5') {
      icds.unshift(isNew ? '99205' : '99215');
    }

    // Handle immunizations
    if (keyword == 'flu') { icds.push(ageYrs < 3 ? '90685' : '90688') }
    if (keyword == 'hepa') { icds.push('90633') }
    if (keyword == 'hpv' || keyword == 'gardasil') { icds.push('90651') }
    if (keyword == 'hib') { icds.push('90647') }
    if (keyword == 'pcv') { icds.push('90670') }
    if (keyword == 'rota') { icds.push('90680') }
    if (keyword == 'dtap/ipv' || keyword == 'kinrix') { icds.push('90696') }
    if (keyword == 'dtap') { icds.push('90700') }
    if (keyword == 'mmr') { icds.push('90707') }
    if (keyword == 'mmrv' || keyword == 'proquad') { icds.push('90710') }
    if (keyword == 'tdap') { icds.push('90715') }
    if (keyword == 'vzv' || keyword == 'varicella') { icds.push('90716') }
    if (keyword == 'pediarix' || keyword == 'dtap/ipv/hepb') { icds.push('90723') }
    if (keyword == 'mcv' || keyword == 'menactra' || keyword == 'menacwy') { icds.push('90734') }
    if (keyword == 'hepb') { icds.push('90744') }

    // Handle procedures
    if (keyword == 'circ') { icds.unshift('54160', 'N47.1') }
    if (keyword == 'ctx') { icds.push('J0696') }
    if (keyword == 'denver' || keyword == 'mchat') { icds.push('96110') }
    if (keyword == 'dex') { icds.push('J1100') }
    if (keyword == 'hearing' || keyword == 'audio') { icds.push('92552') }
    if (keyword == 'preg') { icds.push('81025') }
    if (keyword == 'neb') { icds.push('94640', 'J7613.63', 'A7016') }
    if (keyword == 'rss' || keyword == 'strep') { icds.push('87880') }
    if (keyword == 'vision') { icds.push('99173') }
    if (keyword == 'wax' || keyword == 'cerumen') { icds.push('69210', 'H61.20') }
  });

  // Flatten out nested lists, which represent groups of ICD codes (like for dental)
  icds = icds.flat();

  // Flu shot if >=6mo and October-March and not already added
  if (isWcc && isFluSeason && ageYrs >= 0.5 && !icds.some(c => c == '90685' || c == '90688')) {
    icds.push(ageYrs < 3 ? '90685' : '90688');
  }

  // default to level 3 visit if not wcc and visit level not specified
  if (!isWcc && (icds.length == 0 || !icds.some(c => c.match(/992[0-1][1-5]|N47.1/)))) {
    icds.unshift(isNew ? '99203' : '99213');
  }
  
  // Handle specific diagnoses based on the non-keyword portion of entered text
  let dxtext = '';
  dxToIcd = {
    'constip': 'K59.00',
    'constipation': 'K59.00',
    'concussion': ['S06.0X0A', '94760', '99173'],
    'aom': 'H66.90',
    'asthma': ['J45.901', '94760'],
    'bee': 'T63.441A',
    'bili': 'P59.9',
    'cough': ['R05', '94760'],
    'fever': 'R50.9',
    'headache': 'R51',
    'rash': 'R21',
    'vomiting': 'R11.10', 
    'uti': 'N39.0', 
    'wart': ['17110', 'B07.9'], 
  };
  
  if (dxToIcd[rest]) {
    icds.push(dxToIcd[rest]);
  } else {
    dxtext = rest;
  }

  return { icds: icds.flat(), dxtext, recall };
}

// Separate known keywords in a dictionary from the rest of the text in a string
function extractKeywords(s, dictionary) {
  // Split input into words separated by spaces
  const tokens = s.trim().split(' ');

  // Iterate over each words
  let keywords = [],
      rest = [];
  tokens.forEach(t => {
    // Look for word in dictionary
    let isKeyword = false;
    for (let i=0; i<dictionary.length; i++) {
      const keyword = dictionary[i];
      if ((keyword instanceof RegExp) && t.match(keyword) || (t == keyword)) {
        isKeyword = true;
        break;
      }
    }

    // Separate token that are in the dictionary of keywords into a separate array
    if (isKeyword) {
      keywords.push(t);
    } else {
      rest.push(t);
    }
  });

  // return list of keywords and rest of text as a string
  return { keywords, rest: rest.join(' ') };
}

// Parse the biling charge set
function handleChargeInput() {
  // Get ICD codes from entered text
  const chargeStr = jq('#chargedesc').val().toLowerCase();
  const charges = getCharges(chargeStr);

  // Convert ICD codes to human readable <ul> and display
  const items = charges.icds.length ? 
    charges.icds.map(icd => 
      '<li>' + (ICDToText[icd] || 'ICD Code') + '<span style="color:#aaaaaa">&nbsp;(' + icd + ')</span></li>'
    ) : '';
  if (charges.recall) {
    items.push('<li>Recall in ' + charges.recall.n + ' ' + charges.recall.unit.toLowerCase() + '</li>');
  }
  jq('#chargedetails').html(items);
}

function processCharge() {
  const chargeStr = jq('#chargedesc').val().toLowerCase();
  const { icds, dxtext, recall } = getCharges(chargeStr);
  let searchText = '';

  // For each ICD code, find the corresponding button, and click it if
  // it hasn't already been added
  for (let i = 0; i < icds.length; i++) {
    const code = icds[i];
    const $el = jq('span[title="' + code + '"]').first();
    if (!searchText && $el.length === 0) {
      searchText = code; 
    } else if (!$el.prev().hasClass('codecheckboxchecked')) {
      $el.click();
    }
  }

  // If there was an ICD code without a corresponding button (like Z41.2 for circs),
  // or if there's a diagnosis to search for, set the search text and press enter.
  searchText = searchText || dxtext;
  if (searchText) {
    jq('#ellDiagnosisCodesSearch input').focus().val(searchText).change();
    jq('#ellDiagnosisCodesSearch input')[0].dispatchEvent(new KeyboardEvent('keydown', {bubbles: true, cancelable: true, keyCode: 13}));
  }

  // Set recall
  if (recall && recall.n) {
    // Get visitid of selected appointment
    const $selectedRow = jq('#appointmentsTable tr.selectedrow');
    if ($selectedRow.length) {
      const visitId = $selectedRow.attr('data-visitid');

      // Check for existing appointments using call to AMD builtin onlineChargeSlips.checkFutureAppts(apptType, patientID)
      const ptNodeSelector = '"//patientlist/patient[*/visit[@id=\'' + visitId + '\']]"';
      getXml(
        'onlineChargeSlips.screenXml.selectNodes(' + ptNodeSelector + ').item(0) && ' +
        'onlineChargeSlips.checkFutureAppts("' + recall.type + '", ' + 
          'onlineChargeSlips.screenXml.selectNodes(' + ptNodeSelector + ').item(0).getAttribute("id"))'
      ).then(xml => {
        if (!xml) {
          // No appointment exists. Next, check for existing recall.
          getXml('onlineChargeSlips.screenXml.selectNodes("//patientlist/patient[*/visit[@id=\'' + visitId + '\']]/recalllist/recall")[0]')
          .then(recallXml => {
            // Finally, add new recall if this type doesn't exist yet
            if (!recallXml || recallXml.children[0].getAttribute("appttype") != recall.type) {
              jq('#ellPatientRecallProvider input').val('LEE, JONATHAN').change()[0].dispatchEvent(new KeyboardEvent('keydown', {bubbles: true, cancelable: true, keyCode: 13}))
              jq('#patientRecallTypeSelect').val(recall.type);
              jq('#patientRecallDueAmountSelect').val(recall.n);
              jq('#patientRecallDueTypeSelect').val(recall.unit);
            } else {
              console.log('Found existing recall', recallXml);
            }
          });
        } else {
          console.log('Found existing appointment', xml);
        }
      });
    }
  }
}

// ------------------------------------------------------------------
// Utility functions and look up tables
// ------------------------------------------------------------------
// Run a script in webpage's context by injecting a <script> element
function inject(source) {
  const s = document.createElement('script');
  s.textContent = source;
  (document.head||document.documentElement).appendChild(s);
  s.onload = function() {
    // after js is executed, remove script element
   s.remove();
  };
}

// Get an XML data variable from the webpage context
var resolveGetXml = null;
async function getXml(expr) {
  if (resolveGetXml) {
    return;
  }
  inject('window.postMessage({type:"XML",val:(' + expr + ') && new XMLSerializer().serializeToString(' + expr + ')}, "*");');
  return new Promise(r =>{resolveGetXml = r});
}
function handleMessage(event) {
if (event.source != window) {
    return;
  }
  // Handle messsages passed from webpage via window.postMessage() (i.e. used by getXml())
  if (event && event.data && event.data.type) {
    if (event.data.type == 'XML') {
      const parser = new DOMParser();
      const doc = event.data.val && parser.parseFromString(event.data.val, 'text/xml');
      resolveGetXml(doc);
      resolveGetXml = null;
    } else if (event.data.type == 'event' && event.data.val == 'processChargeSlips') {
      handleProcessSlip();
    }
  }

}

// Descriptions for ICD codes
const ICDToText = {
  '54160': 'Circumcision under 28d',
  '69210': 'Remove impacted',
  '90633': 'HepA',
  '90651': 'HPV',
  '90647': 'Hib',
  '90670': 'PCV',
  '90680': 'Rota',
  '90685': 'Flu shot 6m-3y',
  '90688': 'Flu shot >=3y',
  '90696': 'DTaP/IPV (Kinrix)',
  '90700': 'DTaP',
  '90707': 'MMR',
  '90710': 'MMRV (Proquad)',
  '90715': 'Tdap',
  '90716': 'Varicella',
  '90723': 'DTap/IPV/HepB (Pediarix)',
  '90734': 'MCV',
  '90744': 'HepB',
  '92552': 'Hearing Screen',
  '94760': 'Pulse Ox (single)',
  '96110': 'Devel Screen (Denver/MCHAT)',
  '96127': 'ADHD / Depression Testing',
  '99173': 'Vision Screen',
  '99203': 'Level 3 New Patient',
  '99204': 'Level 4 New Patient',
  '99205': 'Level 5 New Patient',
  '99213': 'Level 3 Established',
  '99214': 'Level 4 Established',
  '99215': 'Level 5 Established',
  '99381': '0-11M New Preventative',
  '99382': '1-4YR New Preventative',
  '99383': '5-11YR New Preventative',
  '99384': '12-17YR New Preventative',
  '99391': '0-11M Est Preventative',
  '99392': '1-4YR Est Preventative',
  '99393': '5-11YR Est Preventative',
  '99394': '12-17YR Est Preventative',
  '99395': '18-39YR Est Preventative',
  '97460': 'Pulse Ox; Single',
  'D0120': 'Periodic Oral Eval',
  'D9999': 'Oral Health Education', 
  'H61.20': 'Impacted Cerumen',
  'H66.90': 'Acute otitis media, unspecified ear',
  'J45.901': 'Asthma',
  'K59.00': 'Constipation',
  'N39.0': 'UTI',
  'N47.1': 'Phimosis',
  'N47.8': 'Other disorders of prepuce',
  'P59.9': 'Neonatal jaundice',
  'R05': 'Cough',
  'R11.10': 'Vomiting',
  'R21': 'Rash and other nonspecific skin',
  'R50.9': 'Fever, unspecified',
  'R51': 'Headache',
  'S06.0X0A': 'Concussion (initial)',
  'T63.441A': 'Bee sting (initial)',
  'Z00.110': 'Newborn <8 days',
  'Z00.111': 'Newborn 8-28 days old',
  'Z00.129': 'Without abnormal findings',
  'Z41.2': 'Encounter for male circumcision'
}