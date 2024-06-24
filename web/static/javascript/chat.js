
  let chatHistory = {temperature: 0, maxTokens: 0, systemPrompt: "", rounds: []} ;

	function showMsg(msg) {	
		console.log("showMsg " + msg) ;
    alert("msg: " + msg) ;
	}
	

  async function chat() {

    let user = document.getElementById("q").value ;
    if (!user) {
      showMsg("please provide some chat input") ;
      return ;
    }

    chatHistory.temperature = Number(document.getElementById("temperature").value) ;
    chatHistory.maxTokens = Number(document.getElementById("maxTokens").value) ;
    chatHistory.systemPrompt = document.getElementById("systemPrompt").value ;

    // add a new round with the latest text

    chatHistory.rounds.push({user: user}) ;

    document.getElementById("chat").disabled = true ;
		try {

			const response = await fetch("/chat", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(chatHistory)
			});
	
			const result = await response.json() ;
			console.log("POST result " + result + " : " + ((result) ? JSON.stringify(result) : "")) ;
			if (result.ok) {
        let lastRound = chatHistory.rounds[chatHistory.rounds.length - 1] ;
            
        lastRound.assistant = result.response ;

        let table = document.getElementById("chatHistory") ;
        let lastRow = table.insertRow(-1) ;
        lastRow.style.verticalAlign = "top";
        let c = lastRow.insertCell(0) ;
        c.style.verticalAlign = "top" ;
        c.innerHTML = "<B>User</B>" ;        

        lastRow.insertCell(1).innerHTML = "<B>" + lastRound.user + "</B>";
        lastRow = table.insertRow(-1) ;
        
        c = lastRow.insertCell(0) ;
        c.style.verticalAlign = "top" ;
        c.innerHTML = "Assistant" ;
        lastRow.insertCell(1).innerHTML = lastRound.assistant.trim().replaceAll("\n", "<BR/>") ;

        document.getElementById("q").value = "" ;
        document.getElementById("systemPrompt").readonly = true ;
        document.getElementById("systemPrompt").disabled = true ;
			}
			else throw Error("Chat failed: " + ((result) ? JSON.stringify(result) : "Unknown error")) ;
		} 
		catch (error) {
      showMsg("Chat error: " + error) ;
			console.error("POST Error:", error) ;
		}	
    document.getElementById("chat").disabled = false ;
  }

	window.addEventListener("load", async (event) => {
		console.log("load event running") ;

    let initQ = document.getElementById("q").value ;

    console.log("chat ele is " +  document.getElementById("chat")) ;

    document.getElementById("chat").addEventListener("click", chat) ;

    document.getElementById("temperature").onchange = function(){
      document.getElementById("showTemperature").innerText = document.getElementById("temperature").value 
    }
    document.getElementById("maxTokens").onchange = function(){
      document.getElementById("showMaxTokens").innerText = document.getElementById("maxTokens").value 
    }    

    document.getElementById("q").addEventListener("keypress", function(event) {
      if (event.key === "Enter") {
        event.preventDefault() ;
        document.getElementById("chat").click() ;
      }
    });    
 
	}) ;
