const express = require("express"); 
const app = express();
const crypto = require('crypto'); 
const bodyParser = require("body-parser");
const axios = require('axios');
const path = require('path');

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended : true}));

// Static files
app.use(express.static(__dirname));

// CORS for API calls
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    next();
});

// Test configuration
const config = {
    mid: "INIBillTst",
    signKey: "SU5JTElURV9UUklQTEVERVNfS0VZU1RS",
    key: "rKnPljRn5m6J9Mzz",
    iv: "W2KLNKra6Wxc1P==",
    apiUrl: "https://iniapi.inicis.com/v2/pg/billing"
};

// Generate formatted timestamp
function getFormattedTimestamp() {
    const now = new Date();
    const pad = (n, length) => {
        let str = '' + n;
        while (str.length < length) {
            str = '0' + str;
        }
        return str;
    };
    
    const yyyy = now.getFullYear().toString();
    const MM = pad(now.getMonth() + 1, 2);
    const dd = pad(now.getDate(), 2);
    const hh = pad(now.getHours(), 2);
    const mm = pad(now.getMinutes(), 2);
    const ss = pad(now.getSeconds(), 2);
    
    return yyyy + MM + dd + hh + mm + ss;
}

// SHA512 hash
function generateSHA512Hash(data) {
    return crypto.createHash('sha512').update(data).digest('hex');
}

// Billing key return handling (when INICIS redirects back)
app.post("/billing-return", async (req, res) => {
    console.log("Billing return received:", req.body);
    
    if (req.body.resultCode === "0000" && req.body.authToken) {
        // Need to call auth API to get billing key
        try {
            const timestamp = Date.now().toString();
            const signature = crypto.createHash('sha256')
                .update(`authToken=${req.body.authToken}&timestamp=${timestamp}`)
                .digest('hex');
            
            const authResponse = await axios.post(req.body.authUrl, {
                mid: req.body.mid,
                authToken: req.body.authToken,
                timestamp: timestamp,
                signature: signature,
                charset: 'UTF-8',
                format: 'JSON'
            });
            
            console.log("Auth response:", authResponse.data);
            
            // Redirect to success page with billing key
            const billKey = authResponse.data.billKey || authResponse.data.CARD_BillKey;
            res.redirect(`/billing-return.html?resultCode=0000&billKey=${billKey}&resultMsg=Success`);
        } catch (error) {
            console.error("Auth error:", error);
            res.redirect(`/billing-return.html?resultCode=FAIL&resultMsg=${encodeURIComponent(error.message)}`);
        }
    } else {
        // Direct redirect with existing parameters
        const queryString = new URLSearchParams(req.body).toString();
        res.redirect(`/billing-return.html?${queryString}`);
    }
});

// API endpoint for billing (정기결제)
app.post("/api/billing/process", async (req, res) => {
    try {
        const { 
            moid, 
            price, 
            billKey, 
            goodName, 
            buyerName, 
            buyerEmail, 
            buyerTel 
        } = req.body;
        
        console.log("Processing billing with billKey:", billKey);
        
        const timestamp = getFormattedTimestamp();
        
        // Prepare data for INICIS API
        const data = {
            url: "http://localhost:3000",
            moid: moid,
            goodName: goodName,
            buyerName: buyerName,
            buyerEmail: buyerEmail,
            buyerTel: buyerTel,
            price: price,
            billKey: billKey
        };
        
        // Generate hash
        const plainText = config.key + config.mid + "billing" + timestamp + JSON.stringify(data);
        const hashData = generateSHA512Hash(plainText.replace(/\\/g, ''));
        
        // API request body
        const requestBody = {
            mid: config.mid,
            type: "billing",
            paymethod: "card",
            timestamp: timestamp,
            clientIp: "127.0.0.1",
            data: data,
            hashData: hashData
        };
        
        console.log("Sending billing request:", requestBody);
        
        // Call INICIS API
        const response = await axios.post(config.apiUrl, requestBody, {
            headers: {
                'Content-Type': 'application/json',
                'charset': 'UTF-8'
            }
        });
        
        console.log("INICIS billing response:", response.data);
        
        if (response.data.resultCode === "00") {
            res.json({
                success: true,
                tid: response.data.data?.tid,
                authDate: response.data.data?.authDate,
                authTime: response.data.data?.authTime,
                price: price,
                message: "결제가 성공적으로 처리되었습니다."
            });
        } else {
            res.status(400).json({
                success: false,
                message: response.data.resultMsg || "결제 처리에 실패했습니다.",
                errorCode: response.data.resultCode
            });
        }
    } catch (error) {
        console.error("Billing error:", error.response?.data || error);
        res.status(500).json({
            success: false,
            message: error.response?.data?.resultMsg || error.message || "서버 오류가 발생했습니다."
        });
    }
});

// Test endpoint to check server
app.get("/test", (req, res) => {
    res.json({ status: "OK", message: "Test server is running" });
});

const PORT = 3001;
app.listen(PORT, () => {
    console.log(`Test billing server is running on http://localhost:${PORT}`);
    console.log(`Open http://localhost:${PORT}/test-billing-complete.html to start testing`);
});