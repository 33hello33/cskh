    const API_URL = "https://script.google.com/macros/s/AKfycbxq5F8-Vrdf_vESgan85HyfwmXw9bBcjFtr1beeuvQLL1TUAWYvseSsDuDP30Mv-a_T9g/exec";

fetch(API + "?action=getData")
  .then(r => r.json())
  .then(d => console.log(d));

fetch(API + "?action=addData", {
  method: "POST",
  body: JSON.stringify({
    name: "Nguyễn Văn A",
    phone: "0909xxx"
  })
});
