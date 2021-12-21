// Input fields should only take in numbers
function is_field_in_numerics(evt) {
    evt = (evt) ? evt : window.event;
    let charCode = (evt.which) ? evt.which : evt.keyCode;

    if (charCode > 31 && (charCode < 48 || charCode > 57)) {
        return false;
    }
    // return true;
}

const curl_uri_endpoint = async (_URI, _BODY, _METHOD) => {
    return await fetch(_URI, {
        method: _METHOD,
        headers: {
            'Content-Type': 'application/json',
            'Connection': 'Keep-Alive',
            'Accept': 'application/json'
        },
        mode: 'cors',
        credentials: 'same-origin',
        body: JSON.stringify(_BODY)
    })
        .then(response => response.json())
}

document.querySelector('#get_quote_button').addEventListener('click', async () => {
    const pickUpCode = document.querySelector('#pickUpCode').value;
    const dropOffCode = document.querySelector('#dropOffCode').value;
    const quotation_amount = document.querySelector('#quotation_amount');

    const postBodyContent = {
        "pickUpCode": pickUpCode,
        "dropOffCode": dropOffCode,
        "mass": 20
    };

    if (!pickUpCode || !dropOffCode) return false;

    //curl_uri_endpoint(`https://www.droppa.co.za/droppa/services/plugins/quotes`, postBodyContent, 'POST')
    curl_uri_endpoint(`http://88.99.94.84:8000/droppa/services/plugins/quotes`, postBodyContent, 'POST')
        .then(data => {
            quotation_amount.innerHTML = `<div class="badge bg-dark">R ${data.amount}</div>`;
        })
        .catch(error => console.log(error))
});